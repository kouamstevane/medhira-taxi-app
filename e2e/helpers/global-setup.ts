import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'medjira-service';
const STATE_FILE = join(process.cwd(), 'test-results', 'e2e-global-state.json');

async function waitForHttp(
  url: string,
  timeoutMs = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Service ${url} not ready within ${timeoutMs}ms`,
  );
}

async function isHttpReady(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.status < 500;
  } catch {
    return false;
  }
}

function startFirebaseEmulators(): ChildProcess {
  const args = [
    'firebase',
      'emulators:start',
      '--only',
      'auth,firestore,functions,storage,database',
      '--project',
      PROJECT_ID,
  ];
  const child =
    process.platform === 'win32'
      ? spawn(`npx ${args.join(' ')}`, {
          shell: true,
          stdio: 'ignore',
          env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: '60000' },
          windowsHide: true,
        })
      : spawn('npx', args, {
          stdio: 'ignore',
          detached: true,
          env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: '60000' },
        });
  child.unref();
  return child;
}

function saveState(state: { firebasePid?: number; startedFirebase: boolean }) {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
}

export default async function globalSetup() {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9010';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
  process.env.FUNCTIONS_EMULATOR_HOST ??= '127.0.0.1:5001';

  const firestoreUrl = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const authUrl = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;
  const databaseUrl = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.json`;
  const storageUrl = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${PROJECT_ID}.firebasestorage.app/o`;
  const functionsUrl = `http://${process.env.FUNCTIONS_EMULATOR_HOST}`;
  let firebaseProcess: ChildProcess | undefined;

  if (
    !(await isHttpReady(firestoreUrl)) ||
    !(await isHttpReady(authUrl)) ||
    !(await isHttpReady(databaseUrl)) ||
    !(await isHttpReady(storageUrl)) ||
    !(await isHttpReady(functionsUrl))
  ) {
    firebaseProcess = startFirebaseEmulators();
    await waitForHttp(firestoreUrl, 180000);
    await waitForHttp(authUrl, 180000);
    await waitForHttp(databaseUrl, 180000);
    await waitForHttp(storageUrl, 180000);
    await waitForHttp(functionsUrl, 180000);
  }

  saveState({
    startedFirebase: Boolean(firebaseProcess?.pid),
    firebasePid: firebaseProcess?.pid,
  });

  if (process.env.PLAYWRIGHT_SKIP_DOCKER === '1') return;
  const r = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.e2e.yml',
      'up',
      '-d',
      'stripe-mock',
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0)
    throw new Error(
      'docker compose up failed (is Docker running?)',
    );
  await waitForHttp('http://localhost:12111/v1/charges', 20000);
}
