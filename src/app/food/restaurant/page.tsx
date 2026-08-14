import { Suspense } from 'react';
import RestaurantClient from './[id]/RestaurantClient';

export const dynamic = 'force-static';

export default function Page() {
  return (
    <main>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <RestaurantClient />
      </Suspense>
    </main>
  );
}
