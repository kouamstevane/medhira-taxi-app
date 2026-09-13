"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { app, auth, db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '@/hooks/useAuth';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ArrowRight, Shield } from 'lucide-react';
import { ACTIVE_MARKET } from '@/utils/constants';
import { useTranslation } from '@/hooks/useTranslation';

type AccountStatus = 'not_created' | 'pending' | 'active' | 'restricted' | 'disabled';

interface StatusResult {
  accountId: string | null;
  status: AccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  requirements: {
    currently_due: string[];
    past_due: string[];
    eventually_due: string[];
    pending_verification: string[];
    current_deadline: number | null;
  };
}

const FUNCTIONS_REGION = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timeoutId);
        reject(reason);
      },
    );
  });
}

const REQUIREMENT_KEY_MAP: Record<string, string> = {
  'individual.id_number': 'driver.reqIdNumber',
  'individual.verification.document': 'driver.reqVerificationDocument',
  'individual.verification.additional_document': 'driver.reqAdditionalDocument',
  'individual.address.line1': 'driver.reqAddress',
  'individual.address.city': 'driver.reqCity',
  'individual.address.postal_code': 'driver.reqPostalCode',
  'individual.address.state': 'driver.reqProvinceState',
  'individual.dob.day': 'driver.reqDob',
  'individual.first_name': 'driver.reqFirstName',
  'individual.last_name': 'driver.reqLastName',
  'individual.phone': 'driver.reqPhone',
  'individual.email': 'driver.reqEmail',
  'external_account': 'driver.reqExternalAccount',
  'tos_acceptance.date': 'driver.reqTosAcceptance',
  'tos_acceptance.ip': 'driver.reqTosAcceptance',
  'business_profile.url': 'driver.reqBusinessProfileUrl',
  'business_profile.mcc': 'driver.reqBusinessProfileMcc',
};

function PaymentSetupContent() {
  const router = useRouter();
  const params = useSearchParams();
  const onboardingState = params.get('onboarding'); // 'success' | 'refresh' | null
  const { loading: authLoading } = useAuth();
  const { t, locale } = useTranslation();

  const humanizeRequirement = (key: string): string => {
    const i18nKey = REQUIREMENT_KEY_MAP[key];
    return i18nKey ? t(i18nKey) : key.replace(/[._]/g, ' ');
  };

  const [statusData, setStatusData] = useState<StatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const browserListenerRef = useRef<{ remove: () => void } | null>(null);
  const freshOnboardingStartedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      browserListenerRef.current?.remove();
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      if (!authLoading) {
        router.push('/driver/login');
      }
      return;
    }

    setLoading(true);
    setError(null);
    let initialStatus: StatusResult | null = null;
    try {
      // 1) Direct Firestore read for immediate display / fallback
      try {
        const driverDoc = await withTimeout(
          getDoc(doc(db, 'drivers', user.uid)),
          8000,
          t('driver.stripeTimeoutError'),
        );
        if (driverDoc.exists()) {
          const d = driverDoc.data();
          const req = (d.requirements ?? {}) as Record<string, unknown>;
          initialStatus = {
            accountId: d.stripeAccountId ?? null,
            status: (d.stripeAccountStatus as AccountStatus) ?? (d.stripeAccountId ? 'pending' : 'not_created'),
            chargesEnabled: !!d.stripeChargesEnabled,
            payoutsEnabled: !!d.stripePayoutsEnabled,
            detailsSubmitted: !!d.stripeDetailsSubmitted,
            disabledReason: (d.stripeDisabledReason as string | null) ?? null,
            requirements: {
              currently_due: Array.isArray(req.currently_due) ? (req.currently_due as string[]) : [],
              past_due: Array.isArray(req.past_due) ? (req.past_due as string[]) : [],
              eventually_due: Array.isArray(req.eventually_due) ? (req.eventually_due as string[]) : [],
              pending_verification: Array.isArray(req.pending_verification) ? (req.pending_verification as string[]) : [],
              current_deadline: (req.current_deadline as number | null) ?? null,
            },
          };
          if (mountedRef.current) {
            setStatusData(initialStatus);
          }
        }
      } catch (fsErr) {
        console.warn('[PaymentSetup] Direct Firestore fetch failed, fallback to Cloud Function', fsErr);
      }

      // 2) Refresh via Cloud Function with graceful timeout
      try {
        await withTimeout(
          user.getIdToken(true),
          8000,
          t('driver.stripeTimeoutError'),
        );
        const fn = getFunctions(app, FUNCTIONS_REGION);
        const call = httpsCallable<unknown, StatusResult>(fn, 'getStripeAccountStatus');

        const res = await withTimeout(
          call({}),
          8000,
          t('driver.stripeTimeoutError'),
        );
        if (mountedRef.current && res?.data) {
          setStatusData(res.data);
        }
      } catch (cfErr: unknown) {
        const err = cfErr as { message?: string };
        console.warn('[PaymentSetup] Cloud Function fetch failed or timed out:', err);
        if (mountedRef.current && !initialStatus) {
          setError(err.message || t('driver.cannotFetchStripeStatus'));
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error('[PaymentSetup] fetch failed', err);
      if (mountedRef.current && !initialStatus) {
        setError(err.message || t('driver.cannotFetchStripeStatus'));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [router, authLoading, t]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-redirect to dashboard when status is active with 3s success banner
  useEffect(() => {
    if (statusData?.status === 'active') {
      const tTimer = setTimeout(() => {
        if (mountedRef.current) router.push('/driver/dashboard');
      }, 3000);
      return () => clearTimeout(tTimer);
    }
  }, [statusData?.status, router]);

  const handleResume = useCallback(async () => {
    setRetrying(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push('/driver/login');
        return;
      }
      await user.getIdToken(true);
      const fn = getFunctions(app, FUNCTIONS_REGION);

      if (!statusData?.accountId) {
        const create = httpsCallable<{ country: string }, { accountId: string }>(fn, 'createConnectAccount');
        await create({ country: ACTIVE_MARKET });
      }

      const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const linkFn = httpsCallable<{ returnUrl: string; refreshUrl: string }, { url: string }>(fn, 'createConnectOnboardLink');
      const linkRes = await linkFn({
        returnUrl: `${origin}/stripe-return?role=driver&status=success`,
        refreshUrl: `${origin}/stripe-return?role=driver&status=refresh`,
      });
      const url = linkRes.data?.url;
      if (!url) throw new Error(t('driver.missingOnboardingUrl'));

      if (Capacitor.isNativePlatform()) {
        browserListenerRef.current?.remove();
        const listener = await Browser.addListener('browserFinished', () => {
          browserListenerRef.current?.remove();
          browserListenerRef.current = null;
          if (mountedRef.current) fetchStatus();
        });
        browserListenerRef.current = listener;
        await Browser.open({ url, presentationStyle: 'popover' });
      } else {
        window.location.href = url;
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error('[PaymentSetup] resume failed', err);
      if (mountedRef.current) setError(err.message || t('driver.cannotResumeSetup'));
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  }, [statusData?.accountId, fetchStatus, router, t]);

  useEffect(() => {
    if (
      onboardingState !== 'fresh' ||
      authLoading ||
      loading ||
      !statusData ||
      freshOnboardingStartedRef.current
    ) {
      return;
    }

    freshOnboardingStartedRef.current = true;
    void handleResume();
  }, [onboardingState, authLoading, loading, statusData, handleResume]);

  // UI States ----------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <Loader2 className="w-10 h-10 animate-spin text-[#635bff]" />
        <p className="mt-4 text-[#9CA3AF]">{t('driver.verifyingStripeAccount')}</p>
      </div>
    );
  }

  if (error && !statusData) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <XCircle className="w-12 h-12 text-red-500" />
        <h1 className="text-xl font-bold mt-4">{t('driver.errorTitle')}</h1>
        <p className="mt-2 text-[#9CA3AF] text-center">{error}</p>
        <button
          onClick={fetchStatus}
          className="mt-6 bg-[#635bff] text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> {t('common.retry')}
        </button>
      </div>
    );
  }

  const status = statusData!.status;
  const reqs = statusData!.requirements;
  const allDue = Array.from(new Set([...reqs.past_due, ...reqs.currently_due]));
  const pendingVerif = reqs.pending_verification;

  // Active
  if (status === 'active') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold mt-6 text-center">{t('driver.setupCompletedTitle')}</h1>
        <p className="mt-2 text-[#9CA3AF] text-center max-w-sm">
          {t('driver.setupCompletedDesc')}
        </p>
        <button
          onClick={() => router.push('/driver/dashboard')}
          className="mt-8 bg-green-600 text-white font-bold py-4 px-8 rounded-[28px] flex items-center gap-2 shadow-lg shadow-green-600/30"
        >
          {t('driver.continueToDashboard')} <ArrowRight className="w-5 h-5" />
        </button>
        <p className="mt-4 text-xs text-[#4B5563]">{t('driver.autoRedirectIn3s')}</p>
      </div>
    );
  }

  // Disabled / Restricted
  if (status === 'disabled' || (status === 'restricted' && !allDue.length)) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold mt-6 text-center">{t('driver.accountDisabledTitle')}</h1>
        <p className="mt-2 text-[#9CA3AF] text-center max-w-sm">
          {t('driver.accountDisabledDesc', { reason: statusData!.disabledReason ? ` (${statusData!.disabledReason})` : '' })}
        </p>
        <button
          onClick={() => router.push('/driver/dashboard')}
          className="mt-8 bg-[#1A1A1A] border border-white/10 text-white font-bold py-3 px-6 rounded-xl"
        >
          {t('driver.backToDashboard')}
        </button>
      </div>
    );
  }

  // Pending / Restricted / Not created
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white px-6 py-8 pb-24">
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold mt-6">{t('driver.paymentSetupPendingTitle')}</h1>
          <p className="mt-3 text-[#9CA3AF]">
            {status === 'not_created'
              ? t('driver.notConfiguredStripeDesc')
              : t('driver.stripeNeedsMoreInfoDesc')}
          </p>
        </div>

        {onboardingState === 'success' && (
          <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-300">
            {t('driver.returnedFromStripeIncomplete')}
          </div>
        )}

        {allDue.length > 0 && (
          <div className="mt-6 bg-[#1A1A1A] border border-white/[0.06] rounded-xl p-5">
            <p className="text-sm font-semibold text-white mb-3">{t('driver.missingInfoTitle')}</p>
            <ul className="space-y-2">
              {allDue.map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm text-[#D1D5DB]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span>{humanizeRequirement(key)}</span>
                </li>
              ))}
            </ul>
            {reqs.current_deadline && (
              <p className="mt-3 text-xs text-amber-300">
                {t('driver.provideBeforeDeadline', {
                  date: new Date(reqs.current_deadline * 1000).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-CA'),
                })}
              </p>
            )}
          </div>
        )}

        {pendingVerif.length > 0 && (
          <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-300">
            {t('driver.verificationInProgressStripe')}
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={handleResume}
          disabled={retrying}
          className="mt-8 w-full bg-[#635bff] text-white font-bold py-4 rounded-[28px] flex items-center justify-center gap-2 shadow-lg shadow-[#635bff]/30 disabled:opacity-50"
        >
          {retrying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
          {retrying ? t('driver.openingStripe') : t('driver.resumeStripeSetup')}
        </button>

        <button
          onClick={fetchStatus}
          disabled={loading || retrying}
          className="mt-3 w-full bg-[#1A1A1A] border border-white/10 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" /> {t('driver.refreshStatus')}
        </button>

        <button
          onClick={() => router.push('/driver/dashboard')}
          className="mt-3 w-full text-[#9CA3AF] text-sm py-2"
        >
          {t('driver.laterGoToDashboard')}
        </button>

        <p className="mt-6 text-xs text-[#4B5563] text-center">
          {t('driver.incompleteSetupWarning')}
        </p>
      </div>
    </div>
  );
}

function PaymentSetupLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
      <Loader2 className="w-10 h-10 animate-spin text-[#635bff]" />
      <p className="mt-4 text-[#9CA3AF]">{t('driver.verifyingStripeAccount')}</p>
    </div>
  );
}

export default function PaymentSetupPage() {
  return (
    <Suspense fallback={<PaymentSetupLoadingFallback />}>
      <PaymentSetupContent />
    </Suspense>
  );
}
