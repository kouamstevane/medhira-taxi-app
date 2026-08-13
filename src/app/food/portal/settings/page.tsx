import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import RestaurantSettingsClient from '../[id]/settings/RestaurantSettingsClient';

export default function RestaurantSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <LoadingSpinner />
        </div>
      }
    >
      <RestaurantSettingsClient />
    </Suspense>
  );
}
