import {
  DELETE_BACKFILL_FIELD,
  assertCustomerMenuV2WriteTarget,
  buildCustomerMenuV2BackfillPlan,
  buildCustomerMenuV2RevertPlan,
  type CustomerMenuV2BackfillDocument,
} from '../../../scripts/backfill-customer-menu-v2';
import {
  legacyCustomerMenuSeedItem,
  richCustomerMenuSeedItem,
} from '@/quality/customer-menu-v2-fixtures';

describe('customer menu V2 backfill planner', () => {
  const restaurantId = 'resto-v2-001';

  const toDocument = (
    item: typeof legacyCustomerMenuSeedItem | typeof richCustomerMenuSeedItem,
  ): CustomerMenuV2BackfillDocument => ({
    path: `restaurants/${restaurantId}/menu_items/${item.id}`,
    data: {
      id: item.id,
      restaurantId,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      isAvailable: item.isAvailable ?? true,
      ...(item.modifierGroups ? { modifierGroups: item.modifierGroups } : {}),
      ...(item.supplements ? { supplements: item.supplements } : {}),
      ...(item.allergens ? { allergens: item.allergens } : {}),
      ...(item.nutrition ? { nutrition: item.nutrition } : {}),
      ...(item.checkoutRules ? { checkoutRules: item.checkoutRules } : {}),
    },
  });

  it('backfills legacy items without losing the base customer menu fields', () => {
    const plan = buildCustomerMenuV2BackfillPlan([
      toDocument(legacyCustomerMenuSeedItem),
      toDocument(richCustomerMenuSeedItem),
    ]);

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      path: `restaurants/${restaurantId}/menu_items/${legacyCustomerMenuSeedItem.id}`,
      patch: {
        modifierGroups: [],
        supplements: [],
        allergens: [],
        checkoutRules: {},
      },
    });
  });

  it('is idempotent when the backfilled legacy item is processed a second time', () => {
    const firstPlan = buildCustomerMenuV2BackfillPlan([toDocument(legacyCustomerMenuSeedItem)]);
    const hydratedLegacy = {
      ...toDocument(legacyCustomerMenuSeedItem),
      data: {
        ...toDocument(legacyCustomerMenuSeedItem).data,
        ...firstPlan.changes[0].patch,
      },
    };

    const secondPlan = buildCustomerMenuV2BackfillPlan([hydratedLegacy]);

    expect(firstPlan.changes).toHaveLength(1);
    expect(secondPlan.changes).toHaveLength(0);
  });

  it('produces a reversible patch that only removes the fields added by the backfill', () => {
    const plan = buildCustomerMenuV2BackfillPlan([toDocument(legacyCustomerMenuSeedItem)]);
    const revertPlan = buildCustomerMenuV2RevertPlan(plan.changes);

    expect(revertPlan.changes).toHaveLength(1);
    expect(revertPlan.changes[0]).toMatchObject({
      path: `restaurants/${restaurantId}/menu_items/${legacyCustomerMenuSeedItem.id}`,
      patch: {
        modifierGroups: DELETE_BACKFILL_FIELD,
        supplements: DELETE_BACKFILL_FIELD,
        allergens: DELETE_BACKFILL_FIELD,
        checkoutRules: DELETE_BACKFILL_FIELD,
      },
    });
  });

  it('leaves already populated V2 documents untouched', () => {
    const plan = buildCustomerMenuV2BackfillPlan([toDocument(richCustomerMenuSeedItem)]);

    expect(plan.changes).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  it('preserves malformed or manually supplied V2 values instead of treating them as missing', () => {
    const document = toDocument(legacyCustomerMenuSeedItem);
    document.data.modifierGroups = null;
    document.data.checkoutRules = 'managed-externally';

    const plan = buildCustomerMenuV2BackfillPlan([document]);

    expect(plan.changes[0].patch).toEqual({
      supplements: [],
      allergens: [],
    });
  });

  it('requires an explicit non-production target for remote writes', () => {
    expect(() => assertCustomerMenuV2WriteTarget({
      projectId: 'medjira-taxi-backfill',
      projectWasExplicit: false,
      allowNonProduction: false,
    })).toThrow('Refusing remote menu migration writes');

    expect(() => assertCustomerMenuV2WriteTarget({
      projectId: 'medjira-prod',
      projectWasExplicit: true,
      allowNonProduction: true,
    })).toThrow('production-like project');

    expect(() => assertCustomerMenuV2WriteTarget({
      projectId: 'demo-medjira',
      projectWasExplicit: false,
      allowNonProduction: false,
      emulatorHost: '127.0.0.1:8080',
    })).not.toThrow();
  });
});
