# Customer Menu V2 Rollout

## Enablement order

1. Run the migration planner with `--dry-run` against the emulator or a named non-production project.
2. Review the number of legacy records that would receive empty V2 fields.
3. Apply the backfill only after validating a representative rich item and a legacy item.
4. Verify the customer item details flow on a narrow mobile viewport and a desktop viewport.
5. Monitor checkout validation failures before expanding the dataset or enabling production writes.

The V2 flow is loaded from the existing menu item entry point and keeps the V1 paginated discovery query unchanged. Legacy items remain orderable with empty customization metadata.

## Rollback

- Stop the backfill or customer rollout if item details fail to load or checkout validation rejects valid legacy items.
- Run the migration script with `--revert` while its manifest is available.
- For a non-emulator target, pass its explicit project ID and `--allow-non-production`; production-like project IDs are rejected.
- Keep the legacy menu read path and flat cart path enabled; they do not depend on V2 metadata.
- If a single item is malformed, remove or correct only its V2 metadata and leave its base name, price, category, availability, and image fields intact.

## Residual risks

- Nutrition data is optional and is informational; missing nutrition must not block checkout.
- A legacy item has no modifier or supplement choices until an operator adds them through the compatible menu write path.
- The migration backfills shape defaults, not business-specific modifier data. Rich metadata must come from the restaurant’s authoritative menu source.
- The current backfill manifest is local to the execution environment and must be retained for rollback.
