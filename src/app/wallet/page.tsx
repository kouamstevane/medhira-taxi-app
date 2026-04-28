'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getTransactionHistory, subscribeToWallet } from '@/services/wallet.service';
import { formatCurrencyWithCode } from '@/utils/format';
import { BottomNav } from '@/components/ui/BottomNav';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import Link from 'next/link';
import { type Transaction, TRANSACTION_ICONS } from './_shared';
import { timestampToDate } from '@/lib/firebase-helpers';

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('success')) {
      toast.success('Recharge effectuée avec succès !');
      router.replace('/wallet');
    }
  }, [searchParams, router]);

  useEffect(() => {
    let unsubscribeWallet: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/login'); return; }

      setLoading(true);
      setError('');

      // Charger l'historique des transactions (une fois)
      getTransactionHistory(user.uid, 3)
        .then(txData => {
          setTransactions(txData.map(t => ({
            ...t,
            date: timestampToDate(t.createdAt),
          } as Transaction)));
        })
        .catch(() => {
          // Ignorer les erreurs silencieusement
        });

      // S'abonner au wallet en temps réel
      if (unsubscribeWallet) unsubscribeWallet();
      unsubscribeWallet = subscribeToWallet(
        user.uid,
        (wallet) => {
          setBalance(wallet.balance || 0);
          setLoading(false);
        },
        (err) => {
          const errMsg = err.message;
          if (!errMsg.includes('offline') && !errMsg.includes('permission')) {
            setError('Erreur lors du chargement du portefeuille');
          }
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeWallet) unsubscribeWallet();
    };
  }, [router]);

  const formatDate = (date: Date) =>
    date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  return (
    <div className="min-h-screen bg-background pb-24 max-w-[430px] mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-white/5 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Mon Portefeuille</h1>
        <button onClick={() => router.push('/notifications')} className="p-2 rounded-full hover:bg-white/5 transition">
          <MaterialIcon name="notifications" size="md" className="text-slate-400" />
        </button>
      </header>

      <main className="px-4 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center gap-2">
            <MaterialIcon name="error" size="sm" className="text-destructive" />
            <span className="text-destructive text-sm">{error}</span>
          </div>
        )}

        {/* Hero Balance Card */}
        <div className="relative overflow-hidden glass-card p-6 rounded-3xl border border-primary/20">
          {/* Halo orange subtil */}
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/30 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-40 h-40 bg-primary/10 blur-3xl rounded-full pointer-events-none" />

          <div className="relative flex items-center justify-between mb-3">
            <p className="text-slate-400 text-sm font-medium">Solde disponible</p>
            <MaterialIcon name="account_balance_wallet" size="md" className="text-primary/70" />
          </div>

          {loading ? (
            <div className="h-10 w-40 bg-white/10 rounded-xl animate-pulse mb-2" />
          ) : (
            <p className="relative text-4xl font-black text-white mb-1 tracking-tight">
              {formatCurrencyWithCode(balance)}
            </p>
          )}
          <p className="relative text-slate-500 text-xs">Mis à jour maintenant</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Recharger',  icon: 'add_card', href: '/wallet/recharger', primary: true },
            { label: 'Historique', icon: 'history',   href: '/wallet/historique' },
            { label: 'Profil',     icon: 'person',    href: '/profil' },
          ].map(({ label, icon, href, primary }) => (
            <Link
              key={label}
              href={href}
              className="glass-card flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/5 hover:bg-white/5 active:scale-[0.97] transition-all"
            >
              <MaterialIcon name={icon} size="lg" className={primary ? 'text-primary' : 'text-slate-300'} />
              <span className="text-xs font-medium text-slate-300">{label}</span>
            </Link>
          ))}
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">Dernières transactions</h2>
            <Link href="/wallet/historique" className="text-primary text-sm font-semibold">Voir tout</Link>
          </div>

          <div className="glass-card rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                  <div className="size-10 rounded-full bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-white/5 rounded w-3/4" />
                    <div className="h-2 bg-white/5 rounded w-1/3" />
                  </div>
                  <div className="h-3 bg-white/5 rounded w-16" />
                </div>
              ))
            ) : transactions.length === 0 ? (
              <div className="p-10 text-center">
                <MaterialIcon name="receipt_long" size="xl" className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Aucune transaction récente</p>
              </div>
            ) : (
              transactions.map((t) => {
                const style = TRANSACTION_ICONS[t.type] ?? TRANSACTION_ICONS.payment;
                const isCredit = t.type === 'deposit' || t.type === 'refund';
                return (
                  <div key={t.id} className="p-4 flex items-center gap-3">
                    <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
                      <MaterialIcon name={style.icon} size="sm" className={style.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {t.method || (isCredit ? 'Recharge' : 'Paiement')}
                        {t.type === 'deposit' ? ' — Dépôt' : ''}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(t.date)}</p>
                    </div>
                    <span className={`font-bold text-sm shrink-0 ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                      {isCredit ? '+' : '-'}{formatCurrencyWithCode(t.netAmount ?? t.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
