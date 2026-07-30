'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FormSkeleton } from '@/components/ui/Skeleton';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth/register/phone');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md"><FormSkeleton /></div>
    </div>
  );
}
