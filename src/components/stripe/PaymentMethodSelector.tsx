"use client";

/**
 * Composant PaymentMethodSelector
 *
 * Permet à l'utilisateur de choisir entre :
 *   1. Portefeuille interne (si solde suffisant)
 *   2. Carte bancaire (Stripe — Visa, Mastercard, Apple Pay, Google Pay)
 *
 * @module components/stripe/PaymentMethodSelector
 */

import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { PaymentMethod } from '@/types/stripe';

interface PaymentMethodSelectorProps {
  walletBalance: number;
  fareAmount: number;
  currency: string;
  selectedMethod: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
  loading?: boolean;
}

export function PaymentMethodSelector({
  walletBalance,
  fareAmount,
  currency,
  selectedMethod,
  onSelect,
  loading = false,
}: PaymentMethodSelectorProps) {
  const walletSufficient = walletBalance >= fareAmount;

  const formattedBalance = new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(walletBalance);

  const formattedFare = new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(fareAmount);

  return (
    <div className="space-y-3">
      <p className="text-slate-400 text-sm font-medium">Mode de paiement</p>

      {/* Option Portefeuille */}
      <button
        type="button"
        onClick={() => walletSufficient && onSelect('wallet')}
        disabled={!walletSufficient || loading}
        className={[
          'w-full flex items-center gap-4 p-4 rounded-2xl border transition-all',
          selectedMethod === 'wallet' && walletSufficient
            ? 'border-primary bg-primary/10'
            : 'border-white/10 bg-white/5',
          !walletSufficient ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]',
        ].join(' ')}
      >
        <div
          className={[
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
            selectedMethod === 'wallet' && walletSufficient ? 'bg-primary/20' : 'bg-white/10',
          ].join(' ')}
        >
          <MaterialIcon
            name="account_balance_wallet"
            size="md"
            className={selectedMethod === 'wallet' && walletSufficient ? 'text-primary' : 'text-slate-400'}
          />
        </div>

        <div className="flex-1 text-left">
          <p className="text-white font-medium text-sm">Portefeuille</p>
          <p className="text-slate-400 text-xs">
            Solde : {formattedBalance}
            {!walletSufficient && (
              <span className="text-destructive ml-1">— Insuffisant pour {formattedFare}</span>
            )}
          </p>
        </div>

        {selectedMethod === 'wallet' && walletSufficient && (
          <MaterialIcon name="check_circle" size="md" className="text-primary flex-shrink-0" />
        )}
      </button>

      {/* Option Carte bancaire */}
      <button
        type="button"
        onClick={() => onSelect('card')}
        disabled={loading}
        className={[
          'w-full flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer active:scale-[0.98]',
          selectedMethod === 'card'
            ? 'border-primary bg-primary/10'
            : 'border-white/10 bg-white/5',
        ].join(' ')}
      >
        <div
          className={[
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
            selectedMethod === 'card' ? 'bg-primary/20' : 'bg-white/10',
          ].join(' ')}
        >
          <MaterialIcon
            name="credit_card"
            size="md"
            className={selectedMethod === 'card' ? 'text-primary' : 'text-slate-400'}
          />
        </div>

        <div className="flex-1 text-left">
          <p className="text-white font-medium text-sm">Carte bancaire</p>
          <p className="text-slate-400 text-xs">Visa · Mastercard · Apple Pay · Google Pay</p>
        </div>

        {selectedMethod === 'card' && (
          <MaterialIcon name="check_circle" size="md" className="text-primary flex-shrink-0" />
        )}
      </button>

      {/* Note de sécurité */}
      <div className="flex items-center gap-1.5 justify-center pt-1">
        <MaterialIcon name="lock" size="sm" className="text-slate-500" />
        <span className="text-xs text-slate-500">Paiement sécurisé · PCI DSS</span>
      </div>
    </div>
  );
}
