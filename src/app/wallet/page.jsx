"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from "@/config/firebase";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        setLoading(true);
        setError('');

        // 1. Chargement du solde
        const walletRef = doc(db, 'wallets', user.uid);
        const walletSnap = await getDoc(walletRef);
        
        console.log("Wallet exists:", walletSnap.exists()); // Debug
        
        if (walletSnap.exists()) {
          setBalance(walletSnap.data().balance || 0);
        } else {
          await setDoc(walletRef, {
            balance: 0,
            currency: 'FCFA',
            updatedAt: new Date()
          });
          setBalance(0);
        }

        // 2. Chargement des transactions (avec gestion d'erreur)
        try {
          console.log("Fetching transactions for user:", user.uid); // Debug
          const transactionsRef = collection(db, 'transactions');
          const q = query(
            transactionsRef,
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(3)
          );

          const querySnapshot = await getDocs(q);
          console.log("Transactions found:", querySnapshot.size); // Debug
          
          const transactionsData = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              // Conversion explicite du Timestamp
              date: data.createdAt?.toDate?.() || new Date()
            };
          });

          setTransactions(transactionsData);
        } catch (transactionError) {
          console.warn("Impossible de charger les transactions:", transactionError.message);
          // Ne pas afficher d'erreur, juste laisser la liste vide
          setTransactions([]);
        }
      } catch (err) {
        console.error("Detailed error:", { 
          message: err.message, 
          stack: err.stack,
          userId: user?.uid 
        });
        // Afficher l'erreur seulement si critique (pas juste les permissions)
        if (!err.message?.includes('offline') && !err.message?.includes('permission')) {
          setError('Erreur lors du chargement du portefeuille');
        }
      } finally {
        setLoading(false);
      }
    } else {
      router.push('/login');
    }
  });

  return () => unsubscribe();
}, [router]);

  // Formater le solde avec séparateurs de milliers
  const formatBalance = (amount) => {
    return amount.toLocaleString('fr-FR');
  };

  return (
    <div className="min-h-screen bg-[#FFF9E6] p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* En-tête avec bouton de retour */}
        <div className="flex items-center mb-6">
          <button 
            onClick={() => router.push('/dashboard')}
            className="mr-4 p-2 rounded-full hover:bg-[#E8D9A5] transition"
            aria-label="Retour"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-6 w-6 text-[#2E2307]"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M10 19l-7-7m0 0l7-7m-7 7h18" 
              />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-[#2E2307]">Mon Portefeuille</h1>
        </div>
        
        {/* Affichage des erreurs */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        
        {/* Carte Solde */}
        <div className="bg-gradient-to-r from-[#2E2307] to-[#3D2F0A] text-white rounded-xl p-6 mb-6 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-80">Solde disponible</p>
              {loading ? (
                <div className="animate-pulse h-8 w-32 bg-[#3D2F0A] rounded mt-1"></div>
              ) : (
                <p className="text-3xl font-bold mt-1">
                  {formatBalance(balance)} FCFA
                </p>
              )}
            </div>
            <button
              onClick={() => router.push('/wallet/recharger')}
              className="bg-[#FDBC01] hover:bg-[#E6A900] text-[#2E2307] px-4 py-2 rounded-full font-semibold text-sm"
              disabled={loading}
            >
              Recharger
            </button>
          </div>
        </div>
        
        {/* Actions rapides */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => router.push('/wallet/recharger')}
            className="bg-white border border-[#E8D9A5] rounded-lg p-4 flex flex-col items-center hover:shadow-md transition"
            disabled={loading}
          >
            <div className="bg-[#FDBC01] text-[#2E2307] p-2 rounded-full mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-[#2E2307]">Recharger</span>
          </button>
          
          <button
            onClick={() => router.push('/wallet/historique')}
            className="bg-white border border-[#E8D9A5] rounded-lg p-4 flex flex-col items-center hover:shadow-md transition"
            disabled={loading}
          >
            <div className="bg-[#2E2307] text-[#FDBC01] p-2 rounded-full mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-sm font-medium text-[#2E2307]">Historique</span>
          </button>
        </div>
        
        {/* Dernières transactions */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-[#2E2307] mb-4">Dernières transactions</h2>
          
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex justify-between items-center border-b border-[#E8D9A5] pb-3">
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-100 rounded w-1/2"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-gray-500">Aucune transaction récente</p>
          ) : (
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex justify-between items-center border-b border-[#E8D9A5] pb-3">
                  <div>
                    <p className="font-medium text-[#2E2307]">
                      {transaction.method || 'Recharge'} - {transaction.type === 'deposit' ? 'Dépôt' : 'Retrait'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {transaction.date?.toLocaleDateString?.('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      }) || 'Date inconnue'}
                    </p>
                  </div>
                  <p className={`font-semibold ${
                    transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.type === 'deposit' ? '+' : '-'}{formatBalance(transaction.netAmount || transaction.amount)} FCFA
                  </p>
                </div>
              ))}
              
              {transactions.length > 0 && (
                <button
                  onClick={() => router.push('/wallet/historique')}
                  className="text-[#FDBC01] font-medium text-sm mt-2 hover:underline"
                >
                  Voir tout l'historique
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}