import { Suspense } from 'react';
import PortalClient from './[id]/PortalClient';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <LoadingSpinner />
        </div>
      }
    >
      <PortalClient />
    </Suspense>
  );
}
