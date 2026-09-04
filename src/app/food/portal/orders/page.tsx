import { Suspense } from 'react';
import OrdersManagementClient from '../[id]/orders/OrdersManagementClient';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { NetworkErrorView } from '@/components/ui';
import { isFirestoreNetworkError } from '@/utils/firestore-error-handler';

void [NetworkErrorView, isFirestoreNetworkError];

export default function Page() {
  return (
    <main>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <LoadingSpinner />
          </div>
        }
      >
        <OrdersManagementClient />
      </Suspense>
    </main>
  );
}
