'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { redirectWithFallback } from '@/utils/navigation';

export default function HomePage() {
  const router = useRouter();
  const { currentUser, loading } = useAuth();
  const redirectedRef = useRef(false);
  const fallbackRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading && currentUser && !redirectedRef.current) {
      redirectedRef.current = true;
      fallbackRef.current = redirectWithFallback(router, '/dashboard');
    }

    return () => {
      if (fallbackRef.current) {
        clearTimeout(fallbackRef.current);
      }
    };
  }, [currentUser, loading, router]);

  if (loading || currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-ping" />
            <div className="relative w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-2xl animate-pulse">
              <MaterialIcon name="local_taxi" className="text-white text-[40px]" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Medjira</h2>
          <p className="text-muted-foreground animate-pulse">
            {loading ? 'Chargement...' : 'Redirection...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background">
      {/* Hero Area */}
      <div className="relative h-[397px] w-full flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 hero-gradient" />
        {/* Decorative glow */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full" />
          <div className="absolute top-[20%] right-[-10%] w-[30%] h-[30%] bg-primary/10 blur-[100px] rounded-full" />
        </div>
        {/* Wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <MaterialIcon name="local_taxi" className="text-primary !text-[40px]" />
          <h2 className="text-white text-[40px] font-extrabold tracking-tight">Medjira</h2>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col px-6 pb-10 justify-between">
        {/* Tagline */}
        <div className="text-center space-y-3">
          <h1 className="text-white text-[22px] font-bold leading-tight">
            Votre taxi &amp; livraison en 1 clic
          </h1>
          <p className="text-slate-400 text-sm font-medium">
            Rapide, fiable, disponible 24h/24
          </p>
        </div>

        {/* Service Chips */}
        <div className="flex justify-center gap-3 py-6">
          {[
            { emoji: '🚕', label: 'Taxi' },
            { emoji: '🍔', label: 'Repas' },
            { emoji: '📦', label: 'Colis' },
          ].map((service) => (
            <div
              key={service.label}
              className="flex h-10 items-center justify-center gap-2 rounded-full glass-card px-5 transition-transform active:scale-95"
            >
              <span className="text-primary text-sm">{service.emoji}</span>
              <p className="text-primary text-sm font-semibold">{service.label}</p>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
          <Link href="/login">
            <button className="h-[56px] w-full bg-gradient-to-r from-primary to-[#ffae00] text-white font-bold text-lg rounded-xl primary-glow flex items-center justify-center transition-all hover:opacity-90 active:scale-[0.98]">
              Se Connecter
            </button>
          </Link>

          <Link href="/auth/register">
            <button className="h-[56px] w-full glass-card border-2 border-primary/60 text-primary font-bold text-lg rounded-xl flex items-center justify-center transition-all hover:bg-primary/10 active:scale-[0.98]">
              Créer un compte
            </button>
          </Link>
        </div>

        {/* Driver Link */}
        <div className="pt-6 text-center">
          <Link
            href="/driver/login"
            className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:underline"
          >
            Vous êtes chauffeur ? Espace Chauffeur
            <MaterialIcon name="arrow_forward" size="sm" />
          </Link>
        </div>
      </div>
    </div>
  );
}
