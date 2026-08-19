import type {
  CustomerMenuCustomizationPayload,
  CustomerMenuItemDetails,
  OrderItem,
} from '@/types/food-delivery';

export type CustomerMenuValidationErrorCode =
  | 'item_mismatch'
  | 'required_modifier_group'
  | 'single_selection_limit'
  | 'modifier_selection_limit'
  | 'unknown_modifier_group'
  | 'unknown_modifier_option'
  | 'unavailable_modifier_option'
  | 'unknown_supplement'
  | 'unavailable_supplement'
  | 'quantity_limit';

export interface CustomerMenuValidationError {
  code: CustomerMenuValidationErrorCode;
  itemId: string;
  message: string;
  groupId?: string;
  optionId?: string;
  supplementId?: string;
}

export interface CustomerMenuValidationResult {
  valid: boolean;
  errors: CustomerMenuValidationError[];
}

export interface CheckoutCartItem {
  id: string;
  menuItemId?: string;
  name: string;
  price: number;
  quantity: number;
  customization?: {
    modifierSelections: CustomerMenuCustomizationPayload['modifierSelections'];
    supplementIds: string[];
    checkoutRules?: CustomerMenuCustomizationPayload['checkoutRules'];
  };
}

export function buildCheckoutOrderItems(items: readonly CheckoutCartItem[]): OrderItem[] {
  return items.map((item) => ({
    menuItemId: item.menuItemId ?? item.id,
    itemName: item.name,
    itemQuantity: item.quantity,
    itemPrice: item.price,
    ...(item.customization
      ? {
          customization: {
            modifierSelections: item.customization.modifierSelections,
            supplementIds: item.customization.supplementIds,
          },
        }
      : {}),
  }));
}

const createError = (
  itemId: string,
  code: CustomerMenuValidationErrorCode,
  message: string,
  extra: Omit<CustomerMenuValidationError, 'code' | 'itemId' | 'message'> = {},
): CustomerMenuValidationError => ({ itemId, code, message, ...extra });

export function validateCustomerMenuCustomization(
  details: CustomerMenuItemDetails,
  payload: CustomerMenuCustomizationPayload,
): CustomerMenuValidationResult {
  const errors: CustomerMenuValidationError[] = [];
  const itemId = details.itemId;

  if (payload.itemId !== itemId) {
    errors.push(createError(itemId, 'item_mismatch', 'La configuration du plat n’est plus valide.'));
  }

  const groupsById = new Map(details.modifierGroups.map((group) => [group.id, group]));
  const selectedGroupIds = new Set<string>();

  for (const selection of payload.modifierSelections) {
    const group = groupsById.get(selection.groupId);
    if (!group) {
      errors.push(createError(itemId, 'unknown_modifier_group', 'Une option de personnalisation est invalide.', {
        groupId: selection.groupId,
      }));
      continue;
    }

    if (selectedGroupIds.has(selection.groupId)) {
      errors.push(createError(itemId, 'modifier_selection_limit', `Le groupe ${group.label} ne peut être sélectionné qu’une seule fois.`, {
        groupId: group.id,
      }));
      continue;
    }
    selectedGroupIds.add(selection.groupId);

    const selectedOptionIds = new Set(selection.optionIds);
    if (selectedOptionIds.size !== selection.optionIds.length) {
      errors.push(createError(itemId, 'modifier_selection_limit', `Une option ne peut pas être sélectionnée plusieurs fois pour ${group.label}.`, {
        groupId: group.id,
      }));
    }
    if (group.selectionType === 'single' && selection.optionIds.length > 1) {
      errors.push(createError(itemId, 'single_selection_limit', `Choisissez une seule option pour ${group.label}.`, {
        groupId: group.id,
      }));
    }

    const maxSelections = group.selectionType === 'single'
      ? 1
      : group.maxSelections > 0 ? group.maxSelections : Number.POSITIVE_INFINITY;
    if (selection.optionIds.length > maxSelections) {
      errors.push(createError(itemId, 'modifier_selection_limit', `Trop d’options sélectionnées pour ${group.label}.`, {
        groupId: group.id,
      }));
    }

    for (const optionId of selectedOptionIds) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option) {
        errors.push(createError(itemId, 'unknown_modifier_option', 'Une option de personnalisation est introuvable.', {
          groupId: group.id,
          optionId,
        }));
      } else if (!option.isAvailable) {
        errors.push(createError(itemId, 'unavailable_modifier_option', `L’option ${option.label} n’est plus disponible.`, {
          groupId: group.id,
          optionId,
        }));
      }
    }
  }

  for (const group of details.modifierGroups) {
    const selection = payload.modifierSelections.find((candidate) => candidate.groupId === group.id);
    const count = selection?.optionIds.length ?? 0;
    const minimum = group.required ? Math.max(group.minSelections, 1) : Math.max(group.minSelections, 0);
    if (count < minimum) {
      errors.push(createError(itemId, 'required_modifier_group', `Sélectionnez au moins ${minimum} option pour ${group.label}.`, {
        groupId: group.id,
      }));
    }
  }

  const supplementsById = new Map(details.supplements.map((supplement) => [supplement.id, supplement]));
  for (const supplementId of new Set(payload.supplementIds)) {
    const supplement = supplementsById.get(supplementId);
    if (!supplement) {
      errors.push(createError(itemId, 'unknown_supplement', 'Un supplément sélectionné est introuvable.', { supplementId }));
    } else if (!supplement.isAvailable) {
      errors.push(createError(itemId, 'unavailable_supplement', `Le supplément ${supplement.label} n’est plus disponible.`, { supplementId }));
    }
  }

  const maxQuantity = details.checkoutRules.maxQuantity;
  if (!Number.isInteger(payload.quantity) || payload.quantity < 1 || (maxQuantity !== undefined && payload.quantity > maxQuantity)) {
    errors.push(createError(itemId, 'quantity_limit', 'La quantité sélectionnée n’est pas valide.'));
  }

  return { valid: errors.length === 0, errors };
}

export function validateCartForCheckout(
  items: readonly CheckoutCartItem[],
  detailsByItemId: ReadonlyMap<string, CustomerMenuItemDetails>,
): CustomerMenuValidationResult {
  const errors: CustomerMenuValidationError[] = [];

  for (const item of items) {
    const itemId = item.menuItemId ?? item.id;
    const details = detailsByItemId.get(itemId);
    if (!details) {
      if (item.customization) {
        errors.push(createError(itemId, 'item_mismatch', 'Les détails de personnalisation de ce plat sont indisponibles.'));
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push(createError(itemId, 'quantity_limit', 'La quantité sélectionnée n’est pas valide.'));
      }
      continue;
    }

    const payload: CustomerMenuCustomizationPayload = {
      itemId,
      quantity: item.quantity,
      modifierSelections: item.customization?.modifierSelections ?? [],
      supplementIds: item.customization?.supplementIds ?? [],
      checkoutRules: item.customization?.checkoutRules,
      customizationPrice: 0,
    };
    errors.push(...validateCustomerMenuCustomization(details, payload).errors);
  }

  return { valid: errors.length === 0, errors };
}
