'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type {
  CustomerMenuCustomizationPayload,
  CustomerMenuItemDetails,
  CustomerMenuModifierGroup,
  CustomerMenuSupplement,
  MenuItem,
} from '@/types/food-delivery';
import { validateCustomerMenuCustomization } from '@/services/checkout.service';
import { CURRENCY_CODE } from '@/utils/constants';

interface CustomerMenuItemCustomizationProps {
  item: Pick<MenuItem, 'id' | 'name' | 'price'>;
  modifierGroups: CustomerMenuModifierGroup[];
  supplements: CustomerMenuSupplement[];
  checkoutRules?: CustomerMenuItemDetails['checkoutRules'];
  onAddToCart?: (payload: CustomerMenuCustomizationPayload) => void;
}

type ModifierSelectionsState = Record<string, string[]>;

function getGroupMinimumSelections(group: CustomerMenuModifierGroup): number {
  if (group.required) {
    return Math.max(group.minSelections, 1);
  }

  return Math.max(group.minSelections, 0);
}

function getGroupMaximumSelections(group: CustomerMenuModifierGroup): number {
  if (group.selectionType === 'single') {
    return 1;
  }

  return group.maxSelections > 0 ? group.maxSelections : Number.POSITIVE_INFINITY;
}

function getInitialModifierSelections(groups: CustomerMenuModifierGroup[]): ModifierSelectionsState {
  return groups.reduce<ModifierSelectionsState>((accumulator, group) => {
    const defaults = group.options
      .filter((option) => option.isDefault)
      .slice(0, getGroupMaximumSelections(group))
      .map((option) => option.id);

    accumulator[group.id] = defaults;
    return accumulator;
  }, {});
}

function formatValidationMessage(group: CustomerMenuModifierGroup, kind: 'min' | 'max'): string {
  if (kind === 'min') {
    return `Sélectionnez au moins ${getGroupMinimumSelections(group)} option pour ${group.label}.`;
  }

  return `Vous pouvez choisir jusqu’à ${getGroupMaximumSelections(group)} options pour ${group.label}.`;
}

function formatPriceDelta(amount: number): string {
  if (amount === 0) {
    return 'Inclus';
  }

  return `+${amount.toFixed(2)} ${CURRENCY_CODE}`;
}

export function CustomerMenuItemCustomization({
  item,
  modifierGroups,
  supplements,
  checkoutRules,
  onAddToCart,
}: CustomerMenuItemCustomizationProps) {
  const minimumQuantity = 1;
  const maximumQuantity = checkoutRules?.maxQuantity && checkoutRules.maxQuantity > 0
    ? checkoutRules.maxQuantity
    : undefined;
  const [modifierSelections, setModifierSelections] = useState<ModifierSelectionsState>(() =>
    getInitialModifierSelections(modifierGroups),
  );
  const [selectedSupplementIds, setSelectedSupplementIds] = useState<string[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(minimumQuantity);

  useEffect(() => {
    setModifierSelections(getInitialModifierSelections(modifierGroups));
    setSelectedSupplementIds([]);
    setValidationMessage(null);
    setQuantity(minimumQuantity);
  }, [
    item.id,
    modifierGroups,
    supplements,
    checkoutRules?.allowZeroQuantity,
    checkoutRules?.maxQuantity,
  ]);

  const totalCustomizationPrice = useMemo(() => {
    const modifierTotal = modifierGroups.reduce((sum, group) => {
      const selectedIds = modifierSelections[group.id] ?? [];

      return (
        sum +
        group.options
          .filter((option) => selectedIds.includes(option.id))
          .reduce((groupSum, option) => groupSum + option.priceDelta, 0)
      );
    }, 0);

    const supplementTotal = supplements
      .filter((supplement) => selectedSupplementIds.includes(supplement.id))
      .reduce((sum, supplement) => sum + supplement.price, 0);

    return modifierTotal + supplementTotal;
  }, [modifierGroups, modifierSelections, selectedSupplementIds, supplements]);

  const handleIncrementQuantity = () => {
    setValidationMessage(null);
    setQuantity((current) => {
      if (maximumQuantity !== undefined && current >= maximumQuantity) {
        setValidationMessage(`Vous pouvez ajouter jusqu’à ${maximumQuantity} exemplaires pour ce plat.`);
        return current;
      }

      return current + 1;
    });
  };

  const handleDecrementQuantity = () => {
    setValidationMessage(null);
    setQuantity((current) => Math.max(minimumQuantity, current - 1));
  };

  const handleSingleSelection = (group: CustomerMenuModifierGroup, optionId: string) => {
    setModifierSelections((current) => ({
      ...current,
      [group.id]: [optionId],
    }));
    setValidationMessage(null);
  };

  const handleMultipleToggle = (group: CustomerMenuModifierGroup, optionId: string, checked: boolean) => {
    setModifierSelections((current) => {
      const currentSelection = current[group.id] ?? [];

      if (!checked) {
        setValidationMessage(null);
        return {
          ...current,
          [group.id]: currentSelection.filter((id) => id !== optionId),
        };
      }

      if (currentSelection.length >= getGroupMaximumSelections(group)) {
        setValidationMessage(formatValidationMessage(group, 'max'));
        return current;
      }

      setValidationMessage(null);
      return {
        ...current,
        [group.id]: [...currentSelection, optionId],
      };
    });
  };

  const handleSupplementToggle = (supplementId: string, checked: boolean) => {
    setSelectedSupplementIds((current) => {
      if (checked) {
        return current.includes(supplementId) ? current : [...current, supplementId];
      }

      return current.filter((id) => id !== supplementId);
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextPayload: CustomerMenuCustomizationPayload = {
      itemId: item.id,
      quantity,
      modifierSelections: modifierGroups
        .map((group) => ({
          groupId: group.id,
          selectionType: group.selectionType,
          optionIds: modifierSelections[group.id] ?? [],
        }))
        .filter((group) => group.optionIds.length > 0),
      supplementIds: selectedSupplementIds,
      checkoutRules,
      customizationPrice: totalCustomizationPrice,
    };

    const validation = validateCustomerMenuCustomization({
      itemId: item.id,
      modifierGroups,
      supplements,
      allergens: [],
      checkoutRules: checkoutRules ?? {},
    }, nextPayload);
    if (!validation.valid) {
      setValidationMessage(validation.errors[0]?.message ?? 'Vérifiez les choix du plat avant de continuer.');
      return;
    }

    setValidationMessage(null);
    onAddToCart?.(nextPayload);
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Quantité</h3>
            <p className="mt-1 text-xs text-slate-400">
              {maximumQuantity !== undefined
                ? `Quantité maximale : ${maximumQuantity}`
                : 'Ajoutez la quantité souhaitée avant de confirmer.'}
            </p>
          </div>

          <div className="flex items-center overflow-hidden rounded-full border border-white/10 bg-black/10">
            <button
              type="button"
              aria-label="Diminuer la quantité"
              onClick={handleDecrementQuantity}
              className="px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              -
            </button>
            <span className="min-w-12 px-3 text-center text-sm font-semibold text-white">{quantity}</span>
            <button
              type="button"
              aria-label="Augmenter la quantité"
              onClick={handleIncrementQuantity}
              className="px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              +
            </button>
          </div>
        </div>
      </section>

      {modifierGroups.map((group) => {
        const selectedIds = modifierSelections[group.id] ?? [];

        return (
          <fieldset
            key={group.id}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-white">{group.label}</legend>
            <p className="mb-3 text-xs text-slate-400">
              {group.selectionType === 'single'
                ? 'Choisissez une option'
                : `Choisissez jusqu’à ${Number.isFinite(getGroupMaximumSelections(group)) ? getGroupMaximumSelections(group) : 'autant d’options que souhaité'}`}
              {group.required ? ' · Obligatoire' : ' · Optionnel'}
            </p>

            <div className="space-y-3">
              {group.options.map((option) => {
                const checked = selectedIds.includes(option.id);

                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-3 text-sm text-white transition hover:border-primary/40"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type={group.selectionType === 'single' ? 'radio' : 'checkbox'}
                        name={`modifier-group-${group.id}`}
                        aria-label={option.label}
                        checked={checked}
                        onChange={(event) => {
                          if (group.selectionType === 'single') {
                            handleSingleSelection(group, option.id);
                            return;
                          }

                          handleMultipleToggle(group, option.id, event.currentTarget.checked);
                        }}
                        className="h-4 w-4 accent-[var(--color-primary,#F97316)]"
                      />
                      <span>{option.label}</span>
                    </span>
                    <span className="text-xs font-medium text-slate-300">{formatPriceDelta(option.priceDelta)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {supplements.length > 0 ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold text-white">Suppléments</h3>
          <p className="mb-3 text-xs text-slate-400">Ajoutez-les indépendamment de votre personnalisation.</p>

          <div className="space-y-3">
            {supplements.map((supplement) => {
              const checked = selectedSupplementIds.includes(supplement.id);

              return (
                <label
                  key={supplement.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-3 text-sm text-white transition hover:border-primary/40"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label={supplement.label}
                      checked={checked}
                      onChange={(event) => handleSupplementToggle(supplement.id, event.currentTarget.checked)}
                      className="h-4 w-4 accent-[var(--color-primary,#F97316)]"
                    />
                    <span>{supplement.label}</span>
                  </span>
                  <span className="text-xs font-medium text-slate-300">+{supplement.price.toFixed(2)} {CURRENCY_CODE}</span>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      {validationMessage ? (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          {validationMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span>{item.name}</span>
          <span>{(item.price * quantity).toFixed(2)} {CURRENCY_CODE}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-slate-300">
          <span>Personnalisation</span>
          <span>{(totalCustomizationPrice * quantity).toFixed(2)} {CURRENCY_CODE}</span>
        </div>
        <div className="mt-3 flex items-center justify-between text-base font-semibold text-white">
          <span>Total</span>
          <span>{((item.price + totalCustomizationPrice) * quantity).toFixed(2)} {CURRENCY_CODE}</span>
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] px-4 py-4 text-base font-bold text-white transition hover:opacity-95"
      >
        Ajouter au panier
      </button>
    </form>
  );
}
