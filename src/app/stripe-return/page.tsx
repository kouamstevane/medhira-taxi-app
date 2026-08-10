"use client";

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function StripeReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const role = searchParams.get('role') || 'driver';
    const status = searchParams.get('status') || 'success';

    if (role === 'driver') {
      router.replace(`/driver/payments/setup?onboarding=${status}`);
    } else if (role === 'restaurant') {
      router.replace(`/restaurant/onboarding/payments?onboarding=${status}`);
    } else {
      router.replace('/dashboard');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
      <Loader2 className="w-10 h-10 animate-spin text-[#635bff]" />
      <p className="mt-4 text-[#9CA3AF]">Redirection depuis Stripe…</p>
    </div>
  );
}

export default function StripeReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <Loader2 className="w-10 h-10 animate-spin text-[#635bff]" />
      </div>
    }>
      <StripeReturnContent />
    </Suspense>
  );
}
