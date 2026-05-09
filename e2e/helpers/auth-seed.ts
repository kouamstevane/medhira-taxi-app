const AUTH_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'medjira-service';

export interface SeedAuthUserInput {
  uid: string;
  email: string;
  password?: string;
  emailVerified?: boolean;
  displayName?: string;
}

export async function seedAuthUser(input: SeedAuthUserInput): Promise<void> {
  const url = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts?key=fake-api-key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      localId: input.uid,
      email: input.email,
      password: input.password ?? 'password123',
      emailVerified: input.emailVerified ?? true,
      displayName: input.displayName,
    }),
  });
  if (!res.ok)
    throw new Error(
      `seedAuthUser failed: ${res.status} ${await res.text()}`,
    );
}

export async function clearAuthEmulator(): Promise<void> {
  const url = `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok)
    throw new Error(`clearAuthEmulator failed: ${res.status}`);
}

export async function fetchVerificationCode(
  email: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<string> {
  const { timeoutMs = 8000, pollMs = 250 } = opts;
  const COLLECTION = 'verificationCodes';
  const { getDocData } = await import('./firestore-seed');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const doc = await getDocData<{ code?: string }>(
      `${COLLECTION}/${email}`,
    );
    if (doc?.code) return doc.code;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `fetchVerificationCode: no code for ${email} after ${timeoutMs}ms`,
  );
}
