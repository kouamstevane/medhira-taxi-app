import { Suspense } from 'react';
import MenuManagementClient from '../[id]/menu/MenuManagementClient';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
        <MenuManagementClient />
      </Suspense>
    </main>
  );
}
