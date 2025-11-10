"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DriverVerifyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md w-full max-w-md p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#101010] mb-2">
            Candidature soumise avec succès !
          </h1>
          <p className="text-gray-600">
            Votre demande d'inscription en tant que chauffeur a été enregistrée.
          </p>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 text-left rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Prochaines étapes :</strong>
              </p>
              <ul className="mt-2 text-sm text-blue-700 list-disc list-inside space-y-1">
                <li>Notre équipe va vérifier vos documents</li>
                <li>Vous recevrez un email de confirmation sous 48h</li>
                <li>Une fois approuvé, vous pourrez vous connecter</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => router.push('/driver/login')}
            className="w-full bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-6 rounded-lg transition duration-200"
          >
            Aller à la page de connexion
          </button>
          
          <Link
            href="/"
            className="block w-full text-center text-[#101010] hover:text-[#f29200] font-medium py-2 transition duration-200"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

