"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DriverVerify() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/driver/login');
    }, 5000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
        <div className="mb-6">
          <svg className="w-16 h-16 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Candidature soumise avec succès</h2>
        <p className="text-gray-600 mb-6">
          Votre demande d'inscription a été reçue. Notre équipe va vérifier vos documents et vous contactera sous 48h.
        </p>
        <p className="text-sm text-gray-500">
          Redirection vers la page de connexion...
        </p>
      </div>
    </div>
  );
}