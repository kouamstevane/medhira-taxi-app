import {
  initializeApp,
  deleteApp,
  getApps,
  type App,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'medjira-service';
const FIRESTORE_HOST =
  process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';

let cachedApp: App | null = null;

function admin(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  }
  if (!cachedApp) {
    cachedApp =
      getApps().find((a) => a.name === 'p5-seed') ??
      initializeApp({ projectId: PROJECT_ID }, 'p5-seed');
  }
  return getFirestore(cachedApp);
}

export async function seedDoc(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await admin().doc(path).set(data, { merge: false });
}

export async function patchDoc(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await admin().doc(path).set(data, { merge: true });
}

export async function getDocData<T = Record<string, unknown>>(
  path: string,
): Promise<T | null> {
  const snap = await admin().doc(path).get();
  return snap.exists ? (snap.data() as T) : null;
}

export async function queryDocId(
  collection: string,
  field: string,
  op: FirebaseFirestore.WhereFilterOp,
  value: unknown,
): Promise<string | null> {
  const snap = await admin()
    .collection(collection)
    .where(field, op, value)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

export async function clearFirestoreEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`clearFirestoreEmulator failed: ${res.status}`);
}

export async function teardown(): Promise<void> {
  if (cachedApp) {
    await deleteApp(cachedApp);
    cachedApp = null;
  }
}
