'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/config/firebase';
import { getTransactionHistoryPaginated, type TransactionPageCursor } from '@/services/wallet.service';
import { onAuthStateChanged } from 'firebase/auth';
import { formatCurrencyWithCode } from '@/utils/format';
import { BottomNav } from '@/components/ui/BottomNav';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { type Transaction, TRANSACTION_ICONS } from '../_shared';
import { timestampToDate } from '@/lib/firebase-helpers';

type FilterType = 'all' | 'deposit' | 'withdrawal' | 'payment';

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all',        label: 'Tout' },
  { value: 'deposit',    label: 'Recharges' },
  { value: 'payment',    label: 'Paiements' },
  { value: 'withdrawal', label: 'Dépenses' },
];

export default function WalletHistoriquePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<TransactionPageCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Authentification : stocke l'uid pour que le second effect puisse y réagir
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/login'); return; }
      setUserId(user.uid);
    });
    return () => unsubscribe();
  }, [router]);

  // Rechargement depuis Firestore à chaque changement de filtre ou d'utilisateur
  useEffect(() => {
    if (!userId) return;
    setTransactions([]);
    setLastDoc(null);
    setHasMore(true);
    setLoading(true);
    fetchTransactions(userId, null, filter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, filter]);

  const fetchTransactions = async (uid: string, cursor: TransactionPageCursor | null, currentFilter: FilterType) => {
    const PAGE_SIZE = 20;
    try {
      const result = await getTransactionHistoryPaginated(uid, {
        pageSize: PAGE_SIZE,
        type: currentFilter !== 'all' ? currentFilter : undefined,
        cursor,
      });

      const docs = result.transactions.map(t => ({
        ...t,
        date: timestampToDate(t.createdAt),
      } as Transaction));

      if (cursor) {
        setTransactions(prev => [...prev, ...docs]);
      } else {
        setTransactions(docs);
      }
      setLastDoc(result.lastDocSnapshot);
      setHasMore(result.hasMore);
    } catch (e) {
      console.error('Erreur transactions:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = async () => {
    if (!userId || !lastDoc || loadingMore) return;
    setLoadingMore(true);
    await fetchTransactions(userId, lastDoc, filter);
  };

  const filtered = transactions; // Firestore filtre déjà par type, plus besoin de filtrage côté client

  const totalCredits = transactions.filter(t => t.type === 'deposit' || t.type === 'refund').reduce((s, t) => s + (t.netAmount ?? t.amount), 0);
  const totalDebits  = transactions.filter(t => t.type !== 'deposit' && t.type !== 'refund').reduce((s, t) => s + (t.netAmount ?? t.amount), 0);

  const formatDate = (date: Date) =>
    date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const groupByMonth = (txs: Transaction[]) => {
    const groups: Record<string, Transaction[]> = {};
    txs.forEach(t => {
      const key = t.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  };

  const grouped = groupByMonth(filtered);

  return (
    <div className="min-h-screen bg-background pb-24 max-w-[430px] mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-white/5 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-white/5 transition">
          <MaterialIcon name="arrow_back" size="md" className="text-white" />
        </button>
        <h1 className="text-xl font-bold text-white flex-1">Historique</h1>
      </header>

      <main className="px-4 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-400 mb-1">Total crédits</p>
            <p className="text-xl font-bold text-green-400">{formatCurrencyWithCode(totalCredits)}</p>
          </div>
          <div className="glass-card p-4 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-400 mb-1">Total dépenses</p>
            <p className="text-xl font-bold text-red-400">{formatCurrencyWithCode(totalDebits)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                filter === value
                  ? 'bg-primary text-white'
                  : 'glass-card border border-white/10 text-slate-300 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <MaterialIcon name="progress_activity" size="xl" className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center border border-white/5">
            <MaterialIcon name="receipt_long" size="xl" className="text-slate-600 mx-auto mb-3" />
            <p className="text-white font-bold mb-1">Aucune transaction</p>
            <p className="text-slate-400 text-sm">Aucune transaction dans cette catégorie.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([month, txs]) => (
              <div key={month}>
                <p className="text-xs uppercase font-bold text-slate-500 mb-3 tracking-wider">{month}</p>
                <div className="space-y-2">
                  {txs.map(t => {
                    const style = TRANSACTION_ICONS[t.type] ?? TRANSACTION_ICONS.payment;
                    const isCredit = t.type === 'deposit' || t.type === 'refund';
                    return (
                      <div key={t.id} className="glass-card p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                        <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
                          <MaterialIcon name={style.icon} size="sm" className={style.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {t.method || (isCredit ? 'Recharge' : 'Paiement')}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-500">{formatDate(t.date)}</p>
                            {t.status === 'pending' && (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                                En attente
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`font-bold text-sm shrink-0 ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                          {isCredit ? '+' : '-'}{formatCurrencyWithCode(t.netAmount ?? t.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 border border-primary/40 text-primary font-bold rounded-2xl hover:bg-primary/5 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingMore
                  ? <><MaterialIcon name="progress_activity" size="sm" className="animate-spin" /> Chargement...</>
                  : 'Charger plus'
                }
              </button>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
