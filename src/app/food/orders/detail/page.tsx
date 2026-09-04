import { Suspense } from 'react';
import OrderTrackingClient from '../[id]/OrderTrackingClient';
import { NetworkErrorView } from '@/components/ui';
import { isFirestoreNetworkError } from '@/utils/firestore-error-handler';

export const dynamic = 'force-static';

void [NetworkErrorView, isFirestoreNetworkError];

export default function Page() {
  return (
    <main>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <OrderTrackingClient />
      </Suspense>
    </main>
  );
}
