'use client';

import dynamic from 'next/dynamic';
import { FormSkeleton } from '@/components/ui/Skeleton';

const SetupPaymentContent = dynamic(() => import('./SetupPaymentContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md"><FormSkeleton /></div>
    </div>
  )
});

export default function SetupPaymentPage() {
  return <SetupPaymentContent />;
}
