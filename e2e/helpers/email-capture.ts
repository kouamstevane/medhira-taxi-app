import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'medjira-service';

export interface CapturedEmail {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
}

function db() {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  const app =
    getApps().find((a) => a.name === 'p5-email-capture') ??
    initializeApp(
      { projectId: PROJECT_ID },
      'p5-email-capture',
    );
  return getFirestore(app);
}

export async function clearEmailCapture(): Promise<void> {
  const snaps = await db().collection('_emails_sent_dev').get();
  await Promise.all(snaps.docs.map((d) => d.ref.delete()));
}

export async function listCapturedEmails(): Promise<CapturedEmail[]> {
  const snaps = await db()
    .collection('_emails_sent_dev')
    .orderBy('capturedAt', 'asc')
    .get();
  return snaps.docs.map((d) => d.data() as CapturedEmail);
}

export async function waitForEmail(
  predicate: (e: CapturedEmail) => boolean,
  timeoutMs = 8000,
): Promise<CapturedEmail> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const emails = await listCapturedEmails();
    const found = emails.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Email matching predicate not received within ${timeoutMs}ms`,
  );
}
