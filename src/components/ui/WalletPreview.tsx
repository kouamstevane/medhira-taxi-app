/**
 * Composant WalletPreview - Aperçu rapide du solde
 * 
 * Affiche le solde du portefeuille de l'utilisateur avec effet glassmorphism.
 * Permet un accès rapide à la page du wallet.
 * 
 * @component
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Wallet } from '@/types';
import { CURRENCY_CODE, LIMITS, DEFAULT_LOCALE } from '@/utils/constants';

interface WalletPreviewProps {
  /** Classe CSS personnalisée */
  className?: string;
  /** Position de la card */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * WalletPreview - Aperçu du solde du portefeuille
 * 
 * Composant avec effet glassmorphism qui affiche le solde actuel
 * et permet de naviguer vers la page du wallet.
 */
export const WalletPreview: React.FC<WalletPreviewProps> = ({
  className = '',
  position = 'top-right',
}) => {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  // Classes de position (ajusté pour être en dessous du header)
  const positionClasses = {
    'top-left': 'top-20 left-4',
    'top-right': 'top-20 right-4',
    'bottom-left': 'bottom-24 left-4',
    'bottom-right': 'bottom-24 right-4',
  };

  /**
   * Charger le solde du wallet depuis Firestore
   */
  useEffect(() => {
    const fetchWallet = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const walletRef = doc(db, 'wallets', currentUser.uid);
        const walletSnap = await getDoc(walletRef);

        if (walletSnap.exists()) {
          setWallet(walletSnap.data() as Wallet);
        } else {
          // Créer un wallet dans Firestore s'il n'existe pas
          const newWallet: Wallet = {
            userId: currentUser.uid,
            balance: 0,
            currency: CURRENCY_CODE,
            updatedAt: new Date(),
          };
          
          await setDoc(walletRef, newWallet);
          setWallet(newWallet);
        }
      } catch (error) {
        console.error('Erreur lors du chargement du wallet:', error);
        // En cas d'erreur de permissions, créer quand même un wallet local
        setWallet({
          userId: currentUser.uid,
          balance: 0,
          currency: CURRENCY_CODE,
          updatedAt: new Date(),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();
  }, [currentUser]);

  /**
   * Formater le montant avec séparateurs de milliers
   */
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat(DEFAULT_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  };

  if (!currentUser || loading) {
    return null;
  }

  return (
    <div
      className={`
        fixed ${positionClasses[position]}
        z-[60]
        ${className}
      `}
    >
      <button
        onClick={() => router.push('/wallet')}
        className="
          group relative overflow-hidden
          backdrop-blur-lg bg-white/90 dark:bg-gray-900/90
          border border-white/20
          rounded-2xl shadow-xl
          px-5 py-3
          transition-all duration-300
          hover:shadow-2xl hover:scale-105
          active:scale-95
        "
      >
        {/* Effet de gradient au survol */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#f29200]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="relative flex items-center gap-3">
          {/* Icône Wallet */}
          <div className="p-2 bg-[#f29200]/10 rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-[#f29200]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </div>

          {/* Solde */}
          <div className="text-left">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              Mon solde
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatAmount(wallet?.balance || 0)}{' '}
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {wallet?.currency || CURRENCY_CODE}
              </span>
            </p>
          </div>

          {/* Flèche */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-gray-400 group-hover:text-[#f29200] transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>

        {/* Badge "Recharger" si solde faible (inférieur à LOW_BALANCE_THRESHOLD) */}
        {(wallet?.balance || 0) < LIMITS.LOW_BALANCE_THRESHOLD && (
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
            Recharger
          </div>
        )}
      </button>
    </div>
  );
};




