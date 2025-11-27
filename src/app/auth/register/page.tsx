'use client';

import dynamic from 'next/dynamic';

const RegisterContent = dynamic(() => import('./RegisterContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200]"></div>
    </div>
  )
});

export default function RegisterPage() {
  return <RegisterContent />;
}
