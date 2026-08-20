# Customer Restaurant Menu V2 Migration Notes

## Scope

The V2 migration adds optional customer-facing metadata to existing `restaurants/{restaurantId}/menu_items/{itemId}` documents:

- `modifierGroups`
- `supplements`
- `allergens`
- `checkoutRules`

Nutrition remains optional and is written when provided by the menu author or import source.

## Backfill behavior

Run the planner against a non-production Firestore dataset first:

```bash
npx firebase emulators:exec --project demo-medjira --only firestore "npx tsx scripts/backfill-customer-menu-v2.ts --dry-run"
```

The backfill only adds missing V2 fields. Existing arrays and objects are preserved, so populated modifier, supplement, allergen, and checkout data is not overwritten. A second run is a no-op for records already containing the fields.

Use `--restaurantId <id>` to limit the scan. Use `--apply` only after reviewing the dry-run output and validating representative records in the emulator or another explicitly non-production project. Remote writes require an explicit project and safety acknowledgement:

```bash
npx tsx scripts/backfill-customer-menu-v2.ts --apply --project <non-production-project> --allow-non-production
```

Production-like project IDs are rejected by the script. Emulator writes are allowed without the acknowledgement flag.

## Rollback

An apply run writes a manifest containing the exact fields added to each document:

```bash
npx tsx scripts/backfill-customer-menu-v2.ts --revert
```

Rollback deletes only fields recorded by that manifest, and only while their values still match the defaults written by the backfill. It does not remove fields that existed before the backfill or fields subsequently edited by an operator. Keep the manifest available until the migrated records have been verified.

## Verification checklist

1. Confirm legacy items retain name, price, category, availability, description, and image data.
2. Confirm rich items retain their modifier groups, supplements, allergens, nutrition, and checkout rules.
3. Open a migrated item through the customer detail read path and validate its selections before checkout.
4. Confirm the paginated V1 restaurant catalog still loads without requesting the full menu.
5. Keep nutrition optional; missing nutrition must not block ordering.

The repository migration planner tests cover legacy backfill, idempotence, reversible patches, and preservation of already-populated V2 records.
