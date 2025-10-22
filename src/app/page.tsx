import Image from "next/image";
import Link from 'next/link';

export default function Home() {
  return (
    <div className="font-sans min-h-screen bg-[#f5f5f5] p-6 flex flex-col justify-center items-center">
      {/* Header */}
      <header className="flex justify-center items-center mb-12 w-full max-w-md">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-[#f29200] rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3zM3 5h2v2H3V5zm0 4h2v2H3V9zm0 4h2v2H3v-2zm12-8h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#101010]">Medjira</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center w-full max-w-md">
        <div className="mb-12 text-center px-4">
          <h1 className="text-3xl font-bold text-[#101010] mb-4">
            <span className="text-[#f29200]">Mobilité</span> et{' '}
            <span className="text-[#f29200]">Livraison</span> Simplifiées
          </h1>
          <p className="text-gray-600">
            Commandez un taxi ou faites livrer vos repas en quelques clics
          </p>
        </div>

        <div className="relative w-full h-64 mb-12 px-6">
          <Image
            src="/images/taxi-booking.svg"
            alt="Medjira Service"
            fill
            className="object-contain"
          />
        </div>

        <div className="w-full space-y-8">
          <Link href="/login" passHref>
            <button className="w-full py-3 bg-[#f29200] text-white rounded-xl font-bold shadow-md hover:bg-[#e68600] transition duration-200 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              Se Connecter
            </button>
          </Link>

          <Link href="/register" passHref>
            <button className="w-full py-3 bg-white text-[#101010] border border-[#101010] rounded-xl font-bold shadow-md hover:bg-gray-100 transition duration-200 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6z" />
              </svg>
              Créer un Compte
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}
