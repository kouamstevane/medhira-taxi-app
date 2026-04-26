# Email Verification Code (OTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firebase Auth email verification links with a 6-digit OTP code sent via Resend, with a beautiful Hostinger-inspired dark template and Resend webhook tracking.

**Architecture:** Three new Next.js API routes handle OTP send/verify/webhook. A shared `OTPInput` component handles the 6-digit UI in Step1Intent during registration. Resend webhook events are tracked in Firestore `emailLogs`. Google Sign-In users bypass email verification entirely.

**Tech Stack:** Next.js 14 App Router, Firebase Admin SDK, Resend SDK, Zod, crypto (Node.js built-in), React, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/app/api/auth/send-verification-code/route.ts` | Create | Generates OTP, stores in Firestore, sends via Resend |
| `src/app/api/auth/verify-code/route.ts` | Create | Validates OTP against Firestore, marks email verified |
| `src/app/api/webhooks/resend/route.ts` | Create | Receives Resend events, updates emailLogs in Firestore |
| `src/lib/email-templates.ts` | Modify | Add `getVerificationCodeTemplate(code)` |
| `src/lib/email-service.ts` | Modify | Add `tags` param to `sendEmail()`, add `sendVerificationCodeEmail()` |
| `src/components/ui/OTPInput.tsx` | Create | Reusable 6-input OTP component with auto-focus, countdown |
| `src/app/driver/register/components/Step1Intent.tsx` | Modify | Add Phase B (OTP verification UI) after account creation |
| `src/hooks/useDriverRegistration.ts` | Modify | Add `handleSendVerificationCode`, `handleVerifyCode`, update `handleStep1Next`, remove `emailVerificationService` import, delete email block in `handleStep5FinalSubmit` |
| `src/hooks/useDriverProfile.ts` | Modify | Remove `handleResendVerificationEmail`, `verificationEmailSent`, and related exports |
| `src/app/driver/dashboard/page.tsx` | Modify | Remove `handleResendVerificationEmail`, `sendingEmail` state, `resendVerificationEmail` import, "Renvoyer" button |
| `src/app/driver/profile/page.tsx` | Modify | Remove "Email non vérifié" banner, `verificationEmailSent` and `handleResendVerificationEmail` from destructuring |
| `src/app/driver/verify-email/page.tsx` | Delete | Redundant — verification now at Step1 via OTP |
| `src/app/driver/login/page.tsx` | Modify | Remove "Vérifier mon email" link to deleted verify-email page |
| `middleware.ts` | Modify | Remove `/driver/verify-email` from public routes |
| `src/services/auth.service.ts` | Modify | Add `@deprecated` JSDoc on `sendVerificationEmail()` and `resendVerificationEmail()` |
| `src/services/email-verification.service.ts` | Delete | Replaced by direct API route calls |
| `functions/src/emails/send-verification-email.ts` | Delete | Cloud Function replaced by Next.js API routes |
| `functions/src/index.ts` | Modify | Remove `sendVerificationEmail` / `sendVerificationEmailHttp` exports |
| `firestore.rules` | Modify | Add security rules for `emailVerificationCodes`, `emailLogs`, `adminAlerts` |

---

## Task 1: Email template — `getVerificationCodeTemplate`

**Files:**
- Modify: `src/lib/email-templates.ts`

- [ ] **Step 1: Add the template function at the end of the file**

```typescript
// Ajouter à la fin de src/lib/email-templates.ts

export const getVerificationCodeTemplate = (code: string): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { margin: 0; padding: 0; background-color: #1a1a2e; font-family: 'Inter', Arial, sans-serif; }
      .wrapper { background-color: #1a1a2e; padding: 40px 20px; }
      .container { max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; }
      .header { background-color: #f29200; padding: 32px 24px; text-align: center; }
      .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
      .header p { margin: 6px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px; }
      .body { padding: 36px 32px; }
      .body p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; }
      .code-box { background-color: #f8f9fa; border: 2px solid #f29200; border-radius: 8px; padding: 28px 24px; text-align: center; margin: 28px 0; }
      .code { font-size: 48px; font-weight: 700; letter-spacing: 12px; color: #1a1a2e; line-height: 1; display: block; }
      .expiry { margin-top: 14px; font-size: 13px; color: #6b7280; }
      .security-note { background-color: #fff7ed; border-left: 3px solid #f29200; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 20px 0; }
      .security-note p { margin: 0; color: #92400e; font-size: 13px; }
      .footer { background-color: #1a1a2e; padding: 24px; text-align: center; }
      .footer p { margin: 0; color: rgba(255,255,255,0.5); font-size: 12px; line-height: 1.6; }
      .footer a { color: #f29200; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <div class="header">
          <h1>Vérification de votre email</h1>
          <p>Plateforme de transport Medjira</p>
        </div>
        <div class="body">
          <p>Bonjour,</p>
          <p>Pour finaliser votre inscription en tant que chauffeur Medjira, veuillez saisir le code de vérification ci-dessous dans l'application :</p>
          <div class="code-box">
            <span class="code">${code}</span>
            <p class="expiry">⚠️ Ce code expire dans <strong>15 minutes</strong>.</p>
          </div>
          <div class="security-note">
            <p>🔒 <strong>Ne partagez jamais ce code.</strong> L'équipe Medjira ne vous demandera jamais votre code de vérification.</p>
          </div>
          <p>Si vous n'avez pas demandé ce code, ignorez simplement cet email. Votre compte restera sécurisé.</p>
          <p>Cordialement,<br><strong>L'équipe Medjira</strong></p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Medjira. Tous droits réservés.<br>
          <a href="https://medjira.com">medjira.com</a></p>
        </div>
      </div>
    </div>
  </body>
  </html>
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email-templates.ts
git commit -m "feat(email): add dark OTP verification code template"
```

---

## Task 2: Email service — `sendEmail` tags + `sendVerificationCodeEmail`

**Files:**
- Modify: `src/lib/email-service.ts`

- [ ] **Step 1: Add `tags` param to `sendEmail()` and new `sendVerificationCodeEmail()` function**

Replace the `sendEmail` function signature and add the new function. The full updated file:

```typescript
import { Resend } from 'resend';
import {
  getApprovalTemplate,
  getRejectionTemplate,
  getSuspensionTemplate,
  getDeactivationTemplate,
  getReactivationTemplate,
  getVerificationCodeTemplate,
} from './email-templates';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY manquant dans les variables d\'environnement');
  }
  return new Resend(apiKey);
}

export async function sendEmail({
  to,
  subject,
  html,
  fromName = 'Medjira',
  tags,
}: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<{ messageId?: string }> {
  const resend = getResendClient();
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'medjira@medjira.com';

  const result = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    tags,
  });

  if (result.error) {
    throw new Error(`Erreur Resend: ${result.error.message}`);
  }

  return { messageId: result.data?.id };
}

export async function sendVerificationCodeEmail({
  to,
  code,
  uid,
}: {
  to: string;
  code: string;
  uid: string;
}): Promise<{ messageId?: string }> {
  return sendEmail({
    to,
    subject: 'Votre code de vérification Medjira',
    html: getVerificationCodeTemplate(code),
    fromName: 'Medjira',
    tags: [
      { name: 'uid', value: uid },
      { name: 'type', value: 'verification_code' },
    ],
  });
}

export async function sendDriverStatusEmail({
  to,
  driverName,
  type,
  reason,
}: {
  to: string;
  driverName: string;
  type: 'approval' | 'rejection' | 'suspension' | 'deactivation' | 'reactivation';
  reason?: string;
}) {
  let subject = '';
  let html = '';

  switch (type) {
    case 'approval':
      subject = 'Votre compte chauffeur Medjira a été approuvé !';
      html = getApprovalTemplate(driverName);
      break;
    case 'rejection':
      subject = 'Décision concernant votre demande d\'inscription Medjira';
      html = getRejectionTemplate(driverName, reason);
      break;
    case 'suspension':
      subject = 'Votre compte chauffeur Medjira a été suspendu';
      html = getSuspensionTemplate(driverName, reason);
      break;
    case 'deactivation':
      subject = 'Votre compte chauffeur Medjira a été désactivé';
      html = getDeactivationTemplate(driverName, reason);
      break;
    case 'reactivation':
      subject = 'Votre compte chauffeur Medjira a été réactivé';
      html = getReactivationTemplate(driverName);
      break;
  }

  return await sendEmail({ to, subject, html });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email-service.ts
git commit -m "feat(email): add tags support and sendVerificationCodeEmail function"
```

---

## Task 3: API Route — `POST /api/auth/send-verification-code`

**Files:**
- Create: `src/app/api/auth/send-verification-code/route.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p src/app/api/auth/send-verification-code
```

- [ ] **Step 2: Write the route**

```typescript
// src/app/api/auth/send-verification-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/config/firebase-admin';
import { sendVerificationCodeEmail } from '@/lib/email-service';
import { z } from 'zod';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';

export const runtime = 'nodejs';

const SendVerificationCodeSchema = z.object({
  email: z.string().email('Adresse email invalide'),
});

export async function POST(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 });
  }

  // Authentification
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  let uid: string;
  let tokenEmail: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
    tokenEmail = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Token invalide ou expiré.' }, { status: 401 });
  }

  // Validation
  const body = await request.json();
  const result = SendVerificationCodeSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { email } = result.data;

  // Sécurité : on n'envoie qu'à sa propre adresse
  if (tokenEmail !== email) {
    return NextResponse.json({ error: 'L\'email ne correspond pas à votre compte.' }, { status: 403 });
  }

  // Rate limiting : 1 renvoi max par minute
  const docRef = adminDb.collection('emailVerificationCodes').doc(uid);
  const existing = await docRef.get();
  if (existing.exists) {
    const data = existing.data()!;
    const resendAt = data.resendAt?.toMillis?.() ?? 0;
    const secondsSinceLastSend = (Date.now() - resendAt) / 1000;
    if (secondsSinceLastSend < 60) {
      const retryAfterSeconds = Math.ceil(60 - secondsSinceLastSend);
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques secondes.', retryAfterSeconds },
        { status: 429 }
      );
    }
  }

  // Générer le code
  const code = String(crypto.randomInt(100000, 1000000));
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

  // Stocker dans Firestore
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
  await docRef.set({
    code: hashedCode,
    email,
    expiresAt,
    attempts: 0,
    createdAt: now,
    resendAt: now,
  });

  // Envoyer l'email
  let messageId: string | undefined;
  try {
    const emailResult = await sendVerificationCodeEmail({ to: email, code, uid });
    messageId = emailResult.messageId;
  } catch (err: unknown) {
    console.error('[send-verification-code] Erreur Resend:', err);
    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi de l\'email. Réessayez.' },
      { status: 500 }
    );
  }

  // Créer le log d'email pour le webhook
  if (messageId) {
    await adminDb.collection('emailLogs').doc(messageId).set({
      messageId,
      status: 'sent',
      to: email,
      subject: 'Votre code de vérification Medjira',
      type: 'verification_code',
      uid,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/send-verification-code/route.ts
git commit -m "feat(api): add send-verification-code route with rate limiting and Firestore storage"
```

---

## Task 4: API Route — `POST /api/auth/verify-code`

**Files:**
- Create: `src/app/api/auth/verify-code/route.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p src/app/api/auth/verify-code
```

- [ ] **Step 2: Write the route**

```typescript
// src/app/api/auth/verify-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/config/firebase-admin';
import { z } from 'zod';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';

export const runtime = 'nodejs';

const VerifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir exactement 6 chiffres'),
});

export async function POST(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 });
  }

  // Authentification
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token invalide ou expiré.' }, { status: 401 });
  }

  // Validation
  const body = await request.json();
  const result = VerifyCodeSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { code } = result.data;

  // Lire le document Firestore
  const docRef = adminDb.collection('emailVerificationCodes').doc(uid);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return NextResponse.json(
      { error: 'Aucun code en attente. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  const data = docSnap.data()!;

  // Vérifier l'expiration
  const expiresAt: admin.firestore.Timestamp = data.expiresAt;
  if (expiresAt.toMillis() < Date.now()) {
    await docRef.delete();
    return NextResponse.json(
      { error: 'Code expiré. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  // Vérifier les tentatives
  const attempts: number = data.attempts ?? 0;
  if (attempts >= 3) {
    await docRef.delete();
    return NextResponse.json(
      { error: 'Trop de tentatives. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  // Comparer le code (SHA-256)
  const hashedSubmitted = crypto.createHash('sha256').update(code).digest('hex');
  if (hashedSubmitted !== data.code) {
    const newAttempts = attempts + 1;
    if (newAttempts >= 3) {
      await docRef.delete();
      return NextResponse.json(
        { success: false, error: 'Code incorrect. Trop de tentatives. Demandez un nouveau code.', attemptsLeft: 0 },
        { status: 400 }
      );
    }
    await docRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
    return NextResponse.json(
      { success: false, error: 'Code incorrect.', attemptsLeft: 3 - newAttempts },
      { status: 400 }
    );
  }

  // Succès
  await docRef.delete();

  // Mettre à jour Firebase Auth
  await adminAuth.updateUser(uid, { emailVerified: true });

  // Mettre à jour Firestore drivers (ignore si le doc n'existe pas encore)
  try {
    await adminDb.collection('drivers').doc(uid).update({
      emailVerified: true,
      emailVerifiedAt: admin.firestore.Timestamp.now(),
    });
  } catch {
    // Document drivers pas encore créé — ignoré, Firebase Auth est la source de vérité
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/verify-code/route.ts
git commit -m "feat(api): add verify-code route with SHA-256 comparison and brute-force protection"
```

---

## Task 5: API Route — `POST /api/webhooks/resend`

**Files:**
- Create: `src/app/api/webhooks/resend/route.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p src/app/api/webhooks/resend
```

- [ ] **Step 2: Write the route**

```typescript
// src/app/api/webhooks/resend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/config/firebase-admin';
import { Resend } from 'resend';
import type { WebhookEventPayload } from 'resend';
import * as admin from 'firebase-admin';

export const runtime = 'nodejs';

function eventTypeToStatus(type: string): string {
  const map: Record<string, string> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delayed',
    'email.complained': 'complained',
    'email.bounced': 'bounced',
    'email.failed': 'failed',
  };
  return map[type] ?? 'unknown';
}

export async function POST(request: NextRequest) {
  if (!adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 });
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook/resend] RESEND_WEBHOOK_SECRET manquant');
    return NextResponse.json({ error: 'Configuration manquante.' }, { status: 503 });
  }

  // Lire le body brut pour la validation de signature
  const rawBody = await request.text();

  // Valider la signature via le SDK Resend
  const resend = new Resend();
  let payload: WebhookEventPayload;
  try {
    payload = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get('svix-id') as string,
        timestamp: request.headers.get('svix-timestamp') as string,
        signature: request.headers.get('svix-signature') as string,
      },
      webhookSecret,
    }) as WebhookEventPayload;
  } catch {
    console.error('[webhook/resend] Signature invalide');
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 401 });
  }

  const { type, data } = payload;
  const messageId = data.email_id;
  const now = admin.firestore.Timestamp.now();

  if (!messageId) {
    return NextResponse.json({ received: true });
  }

  const docRef = adminDb.collection('emailLogs').doc(messageId);
  const docSnap = await docRef.get();

  // Si le document n'existe pas, on crée un document minimal.
  if (!docSnap.exists) {
    await docRef.set({
      messageId,
      status: eventTypeToStatus(type),
      to: data.to[0] ?? '',
      subject: data.subject ?? '',
      type: data.tags?.type ?? 'unknown',
      uid: data.tags?.uid ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Mise à jour selon l'événement
  const update: Record<string, unknown> = { updatedAt: now, status: eventTypeToStatus(type) };

  switch (type) {
    case 'email.delivered':
      update.deliveredAt = now;
      break;
    case 'email.delivery_delayed':
      update.delayedAt = now;
      break;
    case 'email.bounced':
      update.bouncedAt = now;
      update.reason = data.bounce?.message ?? 'Inconnu';
      break;
    case 'email.failed':
      update.failedAt = now;
      update.reason = data.failed?.reason ?? 'Inconnu';
      break;
    case 'email.complained':
      update.complainedAt = now;
      // Créer une alerte admin
      await adminDb.collection('adminAlerts').add({
        type: 'email_complaint',
        messageId,
        uid: data.tags?.uid ?? null,
        to: data.to[0] ?? '',
        createdAt: now,
      });
      break;
  }

  await docRef.update(update);

  // Toujours retourner 200 — Resend ne re-tentera pas autrement
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/resend/route.ts
git commit -m "feat(api): add Resend webhook handler with SDK signature validation"
```

---

## Task 6: Composant `OTPInput`

**Files:**
- Create: `src/components/ui/OTPInput.tsx`

- [ ] **Step 1: Create the file**

```typescript
// src/components/ui/OTPInput.tsx
'use client';
import React, { useRef, useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface OTPInputProps {
  email: string;
  onVerify: (code: string) => Promise<{ success: boolean; error?: string; attemptsLeft?: number }>;
  onResend: () => Promise<{ success: boolean; error?: string }>;
  onSuccess?: () => void;
  loading?: boolean;
}

export default function OTPInput({ email, onVerify, onResend, onSuccess, loading = false }: OTPInputProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [verifying, setVerifying] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown 60s au montage
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const updated = [...digits];
    updated[index] = value;
    setDigits(updated);
    setError(null);
    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputsRef.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Veuillez saisir les 6 chiffres du code.');
      return;
    }
    setVerifying(true);
    setError(null);
    const result = await onVerify(code);
    setVerifying(false);
    if (result.success) {
      onSuccess?.();
    } else {
      setError(result.error ?? 'Code incorrect.');
      if (result.attemptsLeft !== undefined) setAttemptsLeft(result.attemptsLeft);
      setDigits(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError(null);
    const result = await onResend();
    setResendLoading(false);
    if (result.success) {
      setCountdown(60);
      setDigits(['', '', '', '', '', '']);
      setAttemptsLeft(3);
    } else {
      setError(result.error ?? 'Erreur lors du renvoi. Réessayez.');
    }
  };

  const isLoading = loading || verifying;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-gray-600 text-sm">
          Un code a été envoyé à <span className="font-semibold text-[#101010]">{email}</span>
        </p>
      </div>

      {/* 6 inputs */}
      <div className="flex justify-center gap-3" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputsRef.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={isLoading}
            className={`w-11 h-14 text-center text-xl font-bold border-2 rounded-xl focus:outline-none transition-colors
              ${error ? 'border-red-400 bg-red-50' : digit ? 'border-[#f29200] bg-orange-50' : 'border-gray-300 bg-white'}
              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'focus:border-[#f29200]'}
            `}
          />
        ))}
      </div>

      {/* Erreur + tentatives */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-red-600 text-sm">{error}</p>
          {attemptsLeft > 0 && attemptsLeft < 3 && (
            <p className="text-red-400 text-xs mt-1">{attemptsLeft} tentative{attemptsLeft > 1 ? 's' : ''} restante{attemptsLeft > 1 ? 's' : ''}</p>
          )}
        </div>
      )}

      {/* Bouton Vérifier */}
      <button
        type="button"
        onClick={handleVerify}
        disabled={isLoading || digits.join('').length < 6}
        className="w-full bg-[#f29200] text-white font-bold py-4 rounded-xl hover:bg-[#e68600] transition-colors flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {verifying ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : null}
        Vérifier mon email
      </button>

      {/* Renvoyer le code */}
      <div className="text-center">
        <p className="text-gray-500 text-sm">Vous n'avez rien reçu ?</p>
        {countdown > 0 ? (
          <p className="text-gray-400 text-sm mt-1">Renvoyer dans <span className="font-semibold text-[#f29200]">{countdown}s</span></p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading}
            className="mt-1 text-[#f29200] font-semibold text-sm hover:underline disabled:opacity-50"
          >
            {resendLoading ? 'Envoi...' : 'Renvoyer le code'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/OTPInput.tsx
git commit -m "feat(ui): add reusable OTPInput component with countdown and auto-focus"
```

---

## Task 7: Modifier `useDriverRegistration.ts` — handlers OTP

**Files:**
- Modify: `src/hooks/useDriverRegistration.ts`

- [ ] **Step 1: Lire les lignes 1-80 du hook (déjà lu) et identifier les imports existants**

Les imports clés :
- `auth` depuis `@/config/firebase`
- `createUserWithEmailAndPassword` depuis `firebase/auth`
- `emailVerificationService` depuis `@/services/email-verification.service`

- [ ] **Step 2: Ajouter les deux nouveaux handlers après `handleLogout` (ligne ~530)**

Ajouter ces deux fonctions dans le corps du hook `useDriverRegistration`, après `handleLogout` et avant le `return {` :

```typescript
  // ============================================================================
  // VÉRIFICATION EMAIL OTP
  // ============================================================================

  const handleSendVerificationCode = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!checkConnectivity()) {
      return { success: false, error: 'Pas de connexion internet.' };
    }
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return { success: false, error: 'Session expirée. Reconnectez-vous.' };

      const res = await fetch('/api/auth/send-verification-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error ?? 'Erreur lors de l\'envoi du code.' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Erreur réseau. Réessayez.' };
    }
  };

  const handleVerifyCode = async (code: string): Promise<{ success: boolean; error?: string; attemptsLeft?: number }> => {
    if (!checkConnectivity()) {
      return { success: false, error: 'Pas de connexion internet.' };
    }
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return { success: false, error: 'Session expirée. Reconnectez-vous.' };

      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error, attemptsLeft: data.attemptsLeft };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Erreur réseau. Réessayez.' };
    }
  };
```

- [ ] **Step 3: Exposer ces handlers dans le return du hook**

Localiser le `return {` du hook et ajouter :
```typescript
handleSendVerificationCode,
handleVerifyCode,
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDriverRegistration.ts
git commit -m "feat(hook): add handleSendVerificationCode and handleVerifyCode to useDriverRegistration"
```

---

## Task 8: Modifier `Step1Intent.tsx` — Phase B OTP

**Files:**
- Modify: `src/app/driver/register/components/Step1Intent.tsx`

- [ ] **Step 1: Mettre à jour l'interface des props et ajouter les imports**

Remplacer le bloc d'interface et les imports en haut du fichier :

```typescript
"use client";
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { FcGoogle } from 'react-icons/fc';
import { InputField } from '@/components/forms/InputField';
import { ERROR_MESSAGES } from '@/utils/constants';
import OTPInput from '@/components/ui/OTPInput';

const step1Schema = z.object({
  email: z.string().email(ERROR_MESSAGES.INVALID_EMAIL),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, ERROR_MESSAGES.INVALID_PHONE),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

export type Step1FormData = z.infer<typeof step1Schema>;

interface Step1IntentProps {
  onNext: (data: Step1FormData) => Promise<void>;
  onGoogleSignIn: () => void;
  initialData?: Partial<Step1FormData>;
  loading?: boolean;
  sendVerificationCode?: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyCode?: (code: string) => Promise<{ success: boolean; error?: string; attemptsLeft?: number }>;
  onVerified?: () => void;
  emailPreVerified?: boolean;
}
```

- [ ] **Step 2: Ajouter les états et la logique Phase B dans le composant**

Remplacer la déclaration du composant (lignes 25 onwards) :

```typescript
export default function Step1Intent({
  onNext,
  onGoogleSignIn,
  initialData,
  loading,
  sendVerificationCode,
  verifyCode,
  onVerified,
  emailPreVerified = false,
}: Step1IntentProps) {
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<Step1FormData>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      email: initialData?.email || '',
      phone: initialData?.phone || '',
      password: '',
    }
  });

  const [verificationPhase, setVerificationPhase] = useState(false);
  const [codeVerified, setCodeVerified] = useState(emailPreVerified);
  const [formData, setFormData] = useState<Step1FormData | null>(null);

  const handleFormSubmit = async (data: Step1FormData) => {
    if (sendVerificationCode) {
      setFormData(data);
      try {
        await onNext(data);
        setVerificationPhase(true);
      } catch {
        // Error already handled in hook
      }
    } else {
      try {
        await onNext(data);
      } catch {
        // Error already handled in hook
      }
    }
  };

  const handleCodeVerified = () => {
    setCodeVerified(true);
    onVerified?.();
  };

  // Phase B : vérification OTP
  if (verificationPhase && !codeVerified && sendVerificationCode && verifyCode) {
    const email = formData?.email ?? getValues('email');
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">✉️</span>
          </div>
          <h2 className="text-2xl font-bold text-[#101010]">Vérifiez votre email</h2>
          <p className="text-gray-500 mt-2">Entrez le code à 6 chiffres envoyé à votre adresse email.</p>
        </div>
        <OTPInput
          email={email}
          onVerify={verifyCode}
          onResend={() => sendVerificationCode(email)}
          onSuccess={handleCodeVerified}
          loading={loading}
        />
      </div>
    );
  }

  // Phase A : formulaire initial (existant, inchangé)
  // ... (garder le reste du JSX existant tel quel, seul handleSubmit cible handleFormSubmit)
```

- [ ] **Step 3: Dans le JSX de Phase A, changer `onSubmit={handleSubmit(onNext)}` en `onSubmit={handleSubmit(handleFormSubmit)}`**

Localiser dans le JSX :
```typescript
// Avant
<form onSubmit={handleSubmit(onNext)}>
// Après
<form onSubmit={handleSubmit(handleFormSubmit)}>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/driver/register/components/Step1Intent.tsx
git commit -m "feat(step1): add OTP verification phase after account creation"
```

---

## Task 9: Modifier `register/page.tsx` — passer les handlers à Step1Intent

**Files:**
- Modify: `src/app/driver/register/page.tsx`

- [ ] **Step 1: Destructurer les nouveaux handlers depuis `useDriverRegistration`**

Localiser le bloc `const { ... } = useDriverRegistration();` et ajouter :
```typescript
handleSendVerificationCode,
handleVerifyCode,
```

- [ ] **Step 2: Passer les props à `Step1Intent`**

Localiser :
```typescript
{currentStep === 1 && (
  <Step1Intent onNext={handleStep1Next} onGoogleSignIn={handleGoogleSignIn} loading={loading} initialData={step1Data} />
)}
```

Remplacer par :
```typescript
{currentStep === 1 && (
  <Step1Intent
    onNext={handleStep1Next}
    onGoogleSignIn={handleGoogleSignIn}
    loading={loading}
    initialData={step1Data}
    sendVerificationCode={handleSendVerificationCode}
    verifyCode={handleVerifyCode}
    onVerified={() => setCurrentStep(2)}
  />
)}
```

> **Note :** `onVerified` appelle directement `setCurrentStep(2)` pour la transition vers Step2. Ceci évite le bug de double appel à `handleStep1Next` — le compte est déjà créé lors du premier `onNext(data)` dans `handleFormSubmit`.

- [ ] **Step 3: Commit**

```bash
git add src/app/driver/register/page.tsx
git commit -m "feat(register): wire OTP handlers to Step1Intent"
```

---

## Task 10: Modifier `handleStep1Next` dans `useDriverRegistration.ts`

**Files:**
- Modify: `src/hooks/useDriverRegistration.ts`

> **Note :** Après la création du compte avec `createUserWithEmailAndPassword()`, le hook appelait `setCurrentStep(2)` immédiatement. Avec le nouveau flux, Step1 reste visible en Phase B après la création — le passage à Step2 est déclenché par Step1 (via `onSuccess` de OTPInput → `handleCodeVerified` → `onVerified` prop → `setCurrentStep(2)` dans `page.tsx`). Il faut donc **ne plus appeler `setCurrentStep(2)` dans `handleStep1Next`** et **appeler `handleSendVerificationCode`** à la place.
>
> **⚠️ IMPORTANT :** Conserver `setStep1Data(data)` (ligne 253) — ne remplacer QUE la ligne `setCurrentStep(2)` (ligne 254).

- [ ] **Step 1: Lire `handleStep1Next` dans le hook**

```bash
grep -n "handleStep1Next" src/hooks/useDriverRegistration.ts
```

Puis lire les lignes identifiées avec Read tool pour voir la logique complète.

- [ ] **Step 2: Après `createUserWithEmailAndPassword()`, ajouter l'envoi du code et supprimer `setCurrentStep(2)`**

Localiser le bloc de `handleStep1Next` qui contient `setCurrentStep(2)`. Remplacer la ligne `setCurrentStep(2)` (ou le bloc équivalent) par :

```typescript
// Envoyer le code OTP — Step1 reste visible en Phase B
// Le passage à Step2 est déclenché par Step1Intent après vérification réussie
await handleSendVerificationCode(data.email);
// Ne PAS appeler setCurrentStep(2) ici
```

**⚠️ IMPORTANT — Re-throw dans le catch :** Le catch block de `handleStep1Next` doit re-throw l'erreur pour que `handleFormSubmit` (devenu async avec `await onNext(data)`) puisse détecter l'échec. Ajouter `throw err;` à la fin du catch block existant :

```typescript
} catch (err) {
  // ... existing error handling (setError, etc.) ...
  throw err;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDriverRegistration.ts
git commit -m "feat(hook): send OTP after account creation, Step2 transition via code verification"
```

---

## Task 11: Modifier `useDriverRegistration.ts` — nettoyage imports et Step5

**Files:**
- Modify: `src/hooks/useDriverRegistration.ts`

- [ ] **Step 1: Supprimer l'import `emailVerificationService` (ligne 14)**

Localiser et supprimer :
```typescript
// SUPPRIMER cette ligne :
import { emailVerificationService } from '@/services/email-verification.service';
```

- [ ] **Step 2: Supprimer le bloc email verification dans `handleStep5FinalSubmit` (lignes 422-440)**

Localiser et **supprimer** le bloc suivant dans `handleStep5FinalSubmit` :
```typescript
// SUPPRIMER tout ce bloc (lignes 422-440) :
try {
  await retryWithBackoff(
    () => emailVerificationService.sendVerificationEmail(
      auth.currentUser?.email || '',
      step2Data.firstName || undefined
    ),
    { maxAttempts: 3 }
  );
  await auditLoggingService.log({
    eventType: AuditEventType.EMAIL_VERIFICATION_SENT,
    userId,
    level: AuditLogLevel.INFO,
    action: 'Email de vérification envoyé après inscription',
    success: true,
    details: { email: auth.currentUser?.email },
  });
} catch {
  // Non-bloquant
}
```

L'email est désormais vérifié à Step1 — ce bloc est redondant.

- [ ] **Step 3: Supprimer `emailVerificationAttempts` du state et du return**

Supprimer la déclaration de state (autour de la ligne 46) :
```typescript
// SUPPRIMER :
const [emailVerificationAttempts, setEmailVerificationAttempts] = useState(0);
```

Supprimer du return object du hook :
```typescript
// SUPPRIMER du return { ... } :
emailVerificationAttempts,
setEmailVerificationAttempts,
```

Ce state est mort — les tentatives sont désormais gérées côté serveur dans Firestore.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDriverRegistration.ts
git commit -m "feat(hook): remove emailVerificationService import and Step5 email block"
```

---

## Task 12: Nettoyer la vérification email — dashboard, profile, verify-email

**Files:**
- Modify: `src/hooks/useDriverProfile.ts`
- Modify: `src/app/driver/dashboard/page.tsx`
- Modify: `src/app/driver/profile/page.tsx`
- Delete: `src/app/driver/verify-email/page.tsx`
- Modify: `middleware.ts`

> **Décision :** Les utilisateurs Google Sign-In ne reçoivent pas de vérification email. Les utilisateurs email/password vérifient à Step1. Toute la vérification email post-inscription est supprimée.

- [ ] **Step 1: Supprimer `handleResendVerificationEmail` dans `useDriverProfile.ts` (lignes 240-254)**

Localiser et **supprimer** la fonction `handleResendVerificationEmail` entière (lignes 240-254).

Supprimer les états et exports associés :
- `verificationEmailSent` / `setVerificationEmailSent` (ligne 33, uniquement utilisé par cette fonction)
- Export de `handleResendVerificationEmail` (ligne 279)
- Export de `verificationEmailSent` (ligne 266)

- [ ] **Step 2: Supprimer la bannière "Email non vérifié" dans `src/app/driver/profile/page.tsx`**

Localiser (lignes 83-110) la bannière conditionnelle `{!isEmailVerified && (...)}` et la **supprimer** entièrement.

Supprimer du destructuring `useDriverProfile()` (lignes 19, 32) :
- `verificationEmailSent,`
- `handleResendVerificationEmail,`

Conserver `isEmailVerified` s'il est utilisé ailleurs dans le composant. Si `isEmailVerified` n'est plus utilisé, le supprimer aussi.

- [ ] **Step 3: Supprimer la vérification email dans `src/app/driver/dashboard/page.tsx`**

Supprimer l'import (ligne 34) :
```typescript
// SUPPRIMER :
import { resendVerificationEmail } from '@/services/auth.service';
```

Supprimer le state (ligne 57) :
```typescript
// SUPPRIMER :
const [sendingEmail, setSendingEmail] = useState(false);
```

Supprimer la fonction `handleResendVerificationEmail` entière (lignes 72-106).

Supprimer le bouton "Renvoyer" dans le bloc Info Message (lignes 640-649) :
```typescript
// SUPPRIMER :
{currentUser && !currentUser.emailVerified && (!driver || driver.status === 'pending') && (
  <button
    onClick={handleResendVerificationEmail}
    disabled={sendingEmail}
    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 flex items-center gap-1"
  >
    <MaterialIcon name="refresh" size="sm" className={sendingEmail ? 'animate-spin' : ''} />
    {sendingEmail ? 'Envoi...' : 'Renvoyer'}
  </button>
)}
```

- [ ] **Step 4: Supprimer la page verify-email chauffeur**

```bash
rm src/app/driver/verify-email/page.tsx
```

> Cette page est devenue redondante : la vérification email se fait maintenant à Step1 de l'inscription via OTP.

- [ ] **Step 5: Supprimer le lien "Vérifier mon email" dans `src/app/driver/login/page.tsx`**

Localiser (ligne 155) le lien vers `/driver/verify-email` et le **supprimer** :
```typescript
// SUPPRIMER :
<Link href="/driver/verify-email" className="text-primary text-sm font-semibold hover:underline">
  Vérifier mon email
</Link>
```

Le bloc `{/* Forgot Password & Verify Email */}` (lignes 153-161) ne doit garder que le lien "Mot de passe oublié".

- [ ] **Step 6: Nettoyer `middleware.ts`**

Supprimer la référence à `/driver/verify-email` (ligne 64) dans les routes publiques :
```typescript
// SUPPRIMER cette ligne :
'/driver/verify-email',
```

> **Note :** Ne PAS supprimer `/auth/verify-email` (ligne 44) — cette page est utilisée par le flux passager, pas le flux chauffeur.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useDriverProfile.ts src/app/driver/profile/page.tsx src/app/driver/dashboard/page.tsx src/app/driver/login/page.tsx middleware.ts
git rm src/app/driver/verify-email/page.tsx
git commit -m "chore: remove post-registration email verification — OTP at Step1 replaces it"
```

---

## Task 13: Ajouter les règles de sécurité Firestore

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Ajouter les règles pour les nouvelles collections**

Localiser le bloc `match /{document=**}` ou la fin des règles existantes, et ajouter avant le closing `}` :

```rules
match /emailVerificationCodes/{uid} {
  allow read, write: if false;
}

match /emailLogs/{messageId} {
  allow read: if isAdmin();
  allow write: if false;
}

match /adminAlerts/{alertId} {
  allow read: if isAdmin();
  allow write: if false;
}
```

> **Note :** L'Admin SDK bypass les règles Firestore — ces règles protègent contre les accès client directs. La fonction `isAdmin()` doit déjà exister dans le fichier de règles.

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat(security): add Firestore rules for emailVerificationCodes, emailLogs, adminAlerts"
```

---

## Task 14: Déprécier `auth.service.ts`

**Files:**
- Modify: `src/services/auth.service.ts`

- [ ] **Step 1: Ajouter `@deprecated` sur `sendVerificationEmail()` (ligne 81)**

Localiser :
```typescript
export const sendVerificationEmail = async (user: User): Promise<void> => {
```

Ajouter au-dessus :
```typescript
/**
 * @deprecated Utiliser POST /api/auth/send-verification-code à la place.
 * L'envoi de code OTP remplace le lien email Firebase Auth.
 */
export const sendVerificationEmail = async (user: User): Promise<void> => {
```

- [ ] **Step 2: Ajouter `@deprecated` sur `resendVerificationEmail()` (ligne 128)**

Localiser :
```typescript
export const resendVerificationEmail = async (
```

Ajouter au-dessus :
```typescript
/**
 * @deprecated Utiliser POST /api/auth/send-verification-code à la place.
 */
export const resendVerificationEmail = async (
```

- [ ] **Step 3: Commit**

```bash
git add src/services/auth.service.ts
git commit -m "chore: deprecate sendVerificationEmail and resendVerificationEmail in auth.service"
```

---

## Task 15: Supprimer les fichiers obsolètes

**Files:**
- Delete: `src/services/email-verification.service.ts`
- Delete: `functions/src/emails/send-verification-email.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Supprimer `email-verification.service.ts`**

```bash
rm src/services/email-verification.service.ts
```

> Vérifier au préalable qu'aucun autre fichier n'importe ce service (grep `email-verification.service`).

- [ ] **Step 2: Supprimer la Cloud Function**

```bash
rm functions/src/emails/send-verification-email.ts
```

- [ ] **Step 3: Nettoyer `functions/src/index.ts`**

Supprimer la ligne 643 (commentaire) :
```typescript
// SUPPRIMER : // L'email de bienvenue est envoyé automatiquement par la Cloud Function sendVerificationEmail
```

Supprimer la ligne 661 (export) :
```typescript
// SUPPRIMER : export { sendVerificationEmail, sendVerificationEmailHttp } from './emails/send-verification-email.js';
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete email-verification.service and send-verification-email Cloud Function"
```

---

## Task 16: Configurer le webhook dans Resend Dashboard + `.env.local`

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Créer le webhook dans Resend Dashboard**

1. Aller sur [resend.com/webhooks](https://resend.com/webhooks)
2. Cliquer "Add Endpoint"
3. URL : `https://medjira.com/api/webhooks/resend`
4. Cocher les événements : `email.delivered`, `email.failed`, `email.bounced`, `email.complained`, `email.delivery_delayed`
5. Copier le **Signing Secret** (commence par `whsec_`)

- [ ] **Step 2: Ajouter la variable dans `.env.local`**

```env
RESEND_WEBHOOK_SECRET=whsec_COLLER_VALEUR_ICI
```

- [ ] **Step 3: Commit (sans la valeur du secret)**

```bash
git add .env.local
git commit -m "chore(env): add RESEND_WEBHOOK_SECRET placeholder"
```

---

## Task 17: Test manuel end-to-end

- [ ] **Step 1: Démarrer le serveur local**

```bash
cd c:/Users/User/Documents/AlloTraining/medhira-taxi-app
npm run dev
```

- [ ] **Step 2: Tester le flux d'inscription**

1. Aller sur `http://localhost:3000/driver/register`
2. Aller à Step1, saisir email/password/phone et soumettre
3. Vérifier que la Phase B OTP s'affiche
4. Vérifier que l'email reçu a le bon design (fond sombre, code en évidence)
5. Saisir le code → vérifier que la transition vers Step2 se fait
6. Vérifier dans Firebase Console (Firestore) que `emailVerificationCodes/{uid}` a été supprimé
7. Vérifier dans Firebase Auth que `emailVerified: true`

- [ ] **Step 3: Tester le flux Google Sign-In**

1. Cliquer "Continuer avec Google" sur Step1
2. Vérifier la transition directe vers Step2 (pas de vérification email)

- [ ] **Step 4: Tester le webhook (optionnel avec ngrok)**

Si tu veux tester le webhook en local :
```bash
# Dans un second terminal
npx ngrok http 3000
# Copier l'URL ngrok → mettre dans Resend Dashboard comme URL de webhook temporaire
```

- [ ] **Step 5: Vérifier les emailLogs dans Firestore**

Après envoi, vérifier dans Firebase Console → Firestore → collection `emailLogs` que le document a été créé avec `status: 'sent'`. Après réception du webhook Resend, vérifier que le status passe à `'delivered'`.

- [ ] **Step 6: Vérifier la suppression des anciens fichiers**

1. Vérifier que `src/services/email-verification.service.ts` est supprimé
2. Vérifier que `functions/src/emails/send-verification-email.ts` est supprimé
3. Vérifier que `functions/src/index.ts` ne contient plus les exports supprimés
4. Lancer `npm run build` pour vérifier qu'il n'y a pas d'erreurs de compilation

---

## Self-Review Checklist

**Spec coverage :**
- ✅ `POST /api/auth/send-verification-code` — Task 3
- ✅ `POST /api/auth/verify-code` — Task 4
- ✅ `POST /api/webhooks/resend` — Task 5 (Resend SDK Webhooks, Correction G)
- ✅ Template email fond sombre avec code en évidence — Task 1
- ✅ `sendEmail()` avec tags — Task 2
- ✅ `sendVerificationCodeEmail()` — Task 2
- ✅ Step1Intent Phase B avec 6 inputs — Tasks 6, 8
- ✅ `useDriverRegistration` handlers + `checkConnectivity()` — Tasks 7, 10
- ✅ Remove `emailVerificationService` import — Task 11
- ✅ Delete email block in `handleStep5FinalSubmit` — Task 11
- ✅ `useDriverProfile.ts` cleanup (remove verification UI) — Task 12
- ✅ `dashboard/page.tsx` cleanup (remove independent email verification) — Task 12
- ✅ `profile/page.tsx` cleanup (remove email verification banner) — Task 12
- ✅ `driver/verify-email/page.tsx` deletion — Task 12
- ✅ `driver/login/page.tsx` cleanup (remove "Vérifier mon email" link) — Task 12
- ✅ `middleware.ts` cleanup (remove `/driver/verify-email` route) — Task 12
- ✅ Webhook events : delivered, failed, bounced, complained, delivery_delayed — Task 5
- ✅ SHA-256 hash du code — Tasks 3, 4
- ✅ Rate limit 1/min — Task 3
- ✅ Max 3 tentatives — Task 4
- ✅ `adminAuth.updateUser(uid, { emailVerified: true })` — Task 4
- ✅ `emailLogs` créé à l'envoi, mis à jour par webhook — Tasks 3, 5
- ✅ Tags Resend `uid` + `type` — Task 2
- ✅ `RESEND_WEBHOOK_SECRET` configuration — Task 16
- ✅ Firestore security rules (`emailVerificationCodes`, `emailLogs`, `adminAlerts`) — Task 13
- ✅ `@deprecated` on `auth.service.ts` — Task 14
- ✅ Delete `email-verification.service.ts` — Task 15
- ✅ Delete `send-verification-email.ts` Cloud Function — Task 15
- ✅ Clean up `functions/src/index.ts` — Task 15
- ✅ Correction H: `data.to[0]` (string[]) + `data.tags?.uid` (Record) — Task 5

**Flow correctness :**
- ✅ `handleFormSubmit` (async) → `await onNext(data)` creates account → catch block for error handling → `setVerificationPhase(true)` shows Phase B
- ✅ `handleCodeVerified` → `onVerified()` → `setCurrentStep(2)` in `page.tsx` (no double-call)
- ✅ `handleStep1Next` : only replaces `setCurrentStep(2)` → `handleSendVerificationCode(data.email)`, preserves `setStep1Data(data)`, catch block re-throws for async `handleFormSubmit`
- ✅ `handleGoogleSignIn` : pas de modification — les utilisateurs Google vont directement à Step2 sans vérification email

**Types consistency :**
- `sendVerificationCodeEmail({ to, code, uid })` — Task 2 défini, Task 3 utilisé ✅
- `getVerificationCodeTemplate(code)` — Task 1 défini, Task 2 utilisé ✅
- `OTPInput({ email, onVerify, onResend, onSuccess, loading })` — Task 6 défini, Task 8 utilisé ✅
- `handleSendVerificationCode(email)` → `Promise<{success, error?}>` — Task 7 défini, Tasks 9, 10 utilisé ✅
- `handleVerifyCode(code)` → `Promise<{success, error?, attemptsLeft?}>` — Task 7 défini, Task 9 utilisé ✅
- `onVerified: () => void` — Task 8 défini, Task 9 passé `() => setCurrentStep(2)` ✅

**Migration order (spec §8.5) :**
- ✅ Étape 1 : API routes + template + service (Tasks 1-5)
- ✅ Étape 2 : Step1Intent + useDriverRegistration (Tasks 6-11)
- ✅ Étape 3 : useDriverProfile cleanup (Task 12)
- ✅ Étape 4 : Firestore rules + deprecation + suppression (Tasks 13-15)
- ✅ Étape 5 : Configuration webhook (Task 16)
- ✅ Étape 6 : Test end-to-end (Task 17)
