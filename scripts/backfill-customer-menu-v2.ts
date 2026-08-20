import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type Firestore,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const DEFAULT_PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'medjira-taxi-backfill';
const DEFAULT_MANIFEST_PATH = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  'backfill-customer-menu-v2.manifest.json',
);
export const DELETE_BACKFILL_FIELD = '__DELETE_BACKFILL_FIELD__' as const;

export interface CustomerMenuV2BackfillDocument {
  path: string;
  data: Record<string, unknown>;
}

export type CustomerMenuV2Field = 'modifierGroups' | 'supplements' | 'allergens' | 'checkoutRules';
export type CustomerMenuV2Patch = Partial<Record<CustomerMenuV2Field, unknown | typeof DELETE_BACKFILL_FIELD>>;

export interface CustomerMenuV2BackfillChange {
  path: string;
  restaurantId: string;
  itemId: string;
  patch: CustomerMenuV2Patch;
  revertPatch: CustomerMenuV2Patch;
}

export interface CustomerMenuV2BackfillPlan {
  scanned: number;
  skipped: number;
  changes: CustomerMenuV2BackfillChange[];
}

interface CliOptions {
  dryRun: boolean;
  apply: boolean;
  revert: boolean;
  restaurantId?: string;
  manifestPath: string;
  projectId: string;
  projectWasExplicit: boolean;
  allowNonProduction: boolean;
}

type ManifestEntry = CustomerMenuV2BackfillChange;

function parseDocumentPath(path: string): { restaurantId: string; itemId: string } | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 4 || parts[0] !== 'restaurants' || parts[2] !== 'menu_items') {
    return null;
  }
  return { restaurantId: parts[1], itemId: parts[3] };
}

function buildPatchFromDocumentData(data: Record<string, unknown>): CustomerMenuV2Patch {
  const patch: CustomerMenuV2Patch = {};

  if (data.modifierGroups === undefined) {
    patch.modifierGroups = [];
  }
  if (data.supplements === undefined) {
    patch.supplements = [];
  }
  if (data.allergens === undefined) {
    patch.allergens = [];
  }
  if (data.checkoutRules === undefined) {
    patch.checkoutRules = {};
  }

  return patch;
}

function invertPatch(patch: CustomerMenuV2Patch): CustomerMenuV2Patch {
  const revertPatch: CustomerMenuV2Patch = {};
  for (const [key, value] of Object.entries(patch) as Array<[CustomerMenuV2Field, unknown]>) {
    if (value === undefined) continue;
    revertPatch[key] = DELETE_BACKFILL_FIELD;
  }
  return revertPatch;
}

function hasBackfillWork(patch: CustomerMenuV2Patch): boolean {
  return Object.values(patch).some((value) => value !== undefined);
}

async function loadManifest(manifestPath: string): Promise<ManifestEntry[]> {
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('manifest is not an array');
    }
    return parsed as ManifestEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveManifest(manifestPath: string, entries: ManifestEntry[]): Promise<void> {
  await writeFile(manifestPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

async function clearManifest(manifestPath: string): Promise<void> {
  try {
    await unlink(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export function buildCustomerMenuV2BackfillPlan(
  documents: CustomerMenuV2BackfillDocument[],
): CustomerMenuV2BackfillPlan {
  const changes: CustomerMenuV2BackfillChange[] = [];
  let skipped = 0;

  for (const document of documents) {
    const parsedPath = parseDocumentPath(document.path);
    if (!parsedPath) {
      skipped += 1;
      continue;
    }

    const patch = buildPatchFromDocumentData(document.data);
    if (!hasBackfillWork(patch)) {
      skipped += 1;
      continue;
    }

    changes.push({
      path: document.path,
      restaurantId: parsedPath.restaurantId,
      itemId: parsedPath.itemId,
      patch,
      revertPatch: invertPatch(patch),
    });
  }

  return {
    scanned: documents.length,
    skipped,
    changes,
  };
}

export function buildCustomerMenuV2RevertPlan(
  changes: CustomerMenuV2BackfillChange[],
): CustomerMenuV2BackfillPlan {
  return {
    scanned: changes.length,
    skipped: 0,
    changes: changes.map((change) => ({
      ...change,
      patch: change.revertPatch,
      revertPatch: change.patch,
    })),
  };
}

async function loadMenuItemDocuments(
  db: Firestore,
  restaurantId?: string,
): Promise<CustomerMenuV2BackfillDocument[]> {
  let query: Query<DocumentData> = db.collectionGroup('menu_items') as Query<DocumentData>;
  if (restaurantId) {
    query = query.where('restaurantId', '==', restaurantId);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((docSnap: QueryDocumentSnapshot<DocumentData>) => ({
    path: docSnap.ref.path,
    data: docSnap.data() as Record<string, unknown>,
  }));
}

async function applyChanges(
  db: Firestore,
  changes: CustomerMenuV2BackfillChange[],
  mode: 'apply' | 'revert',
): Promise<number> {
  let processed = 0;
  for (const change of changes) {
    const docRef = db.doc(change.path);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      continue;
    }

    const currentData = snapshot.data() as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (mode === 'apply') {
      for (const [key, value] of Object.entries(change.patch) as Array<[CustomerMenuV2Field, unknown]>) {
        if (currentData[key] === undefined && value !== undefined) {
          update[key] = value;
        }
      }
    } else {
      for (const [key, value] of Object.entries(change.revertPatch) as Array<[CustomerMenuV2Field, unknown]>) {
        if (
          value === DELETE_BACKFILL_FIELD
          && isDeepStrictEqual(currentData[key], change.patch[key])
        ) {
          update[key] = FieldValue.delete();
        }
      }
    }

    if (Object.keys(update).length === 0) {
      continue;
    }

    await docRef.update(update, snapshot.updateTime ? { lastUpdateTime: snapshot.updateTime } : undefined);
    processed += 1;
  }
  return processed;
}

export function assertCustomerMenuV2WriteTarget(options: {
  projectId: string;
  projectWasExplicit: boolean;
  allowNonProduction: boolean;
  emulatorHost?: string;
}): void {
  if (options.emulatorHost) {
    return;
  }

  if (!options.projectWasExplicit || !options.allowNonProduction) {
    throw new Error(
      'Refusing remote menu migration writes. Set FIRESTORE_EMULATOR_HOST or pass --project <non-production-project> --allow-non-production.',
    );
  }

  if (/(^|[-_])(prod|production)([-_]|$)/i.test(options.projectId)) {
    throw new Error(`Refusing to run customer menu V2 migration against production-like project "${options.projectId}".`);
  }
}

function parseCliArgs(argv: string[]): CliOptions {
  const getValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  return {
    dryRun: argv.includes('--dry-run'),
    apply: argv.includes('--apply'),
    revert: argv.includes('--revert'),
    restaurantId: getValue('--restaurantId'),
    manifestPath: getValue('--manifest') ?? DEFAULT_MANIFEST_PATH,
    projectId: getValue('--project') ?? DEFAULT_PROJECT_ID,
    projectWasExplicit: argv.includes('--project'),
    allowNonProduction: argv.includes('--allow-non-production'),
  };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(argv);
  const activeModes = [options.dryRun, options.apply, options.revert].filter(Boolean).length;
  if (activeModes !== 1) {
    throw new Error('Usage: npx tsx scripts/backfill-customer-menu-v2.ts --dry-run|--apply|--revert [--restaurantId <id>] [--manifest <path>] [--project <id>] [--allow-non-production]');
  }

  if (!options.dryRun) {
    assertCustomerMenuV2WriteTarget({
      projectId: options.projectId,
      projectWasExplicit: options.projectWasExplicit,
      allowNonProduction: options.allowNonProduction,
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    });
  }

  if (!getApps().length) {
    initializeApp({ projectId: options.projectId });
  }

  const db = getFirestore();

  if (options.revert) {
    const manifest = await loadManifest(options.manifestPath);
    if (manifest.length === 0) {
      console.log(`No backfill manifest found at ${options.manifestPath}. Nothing to revert.`);
      return;
    }

    const reverted = await applyChanges(db, manifest, 'revert');
    await clearManifest(options.manifestPath);
    console.log(`Reverted ${reverted} menu items from customer menu V2 backfill.`);
    return;
  }

  const documents = await loadMenuItemDocuments(db, options.restaurantId);
  const plan = buildCustomerMenuV2BackfillPlan(documents);

  if (options.dryRun) {
    console.log(`Scanned ${plan.scanned} menu items.`);
    console.log(`Would update ${plan.changes.length} menu items and skip ${plan.skipped}.`);
    return;
  }

  if (plan.changes.length > 0) {
    const existingManifest = await loadManifest(options.manifestPath);
    const mergedManifest = new Map<string, ManifestEntry>();
    for (const entry of existingManifest) {
      mergedManifest.set(entry.path, entry);
    }
    for (const entry of plan.changes as ManifestEntry[]) {
      mergedManifest.set(entry.path, entry);
    }
    await saveManifest(options.manifestPath, Array.from(mergedManifest.values()));
  }

  const applied = await applyChanges(db, plan.changes, 'apply');

  console.log(`Applied ${applied} menu item backfills from ${plan.scanned} scanned documents.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
