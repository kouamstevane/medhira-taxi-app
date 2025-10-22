"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Données temporaires (à remplacer par Firestore)
const tempTransactions = [
  {
    id: '1',
    type: 'credit',
    amount: 15000,
    description: 'Recharge Orange Money',
    date: new Date('2023-06-15'),
    status: 'completed'
  },
  {
    id: '2',
    type: 'debit',
    amount: 5000,
    description: 'Cotisation Groupe Famille',
    date: new Date('2023-06-10'),
    status: 'completed'
  },
  {
    id: '3',
    type: 'credit',
    amount: 20000,
    description: 'Recharge Mobile Money',
    date: new Date('2023-05-28'),
    status: 'completed'
  },
  {
    id: '4',
    type: 'debit',
    amount: 10000,
    description: 'Paiement bénéficiaire Njangui',
    date: new Date('2023-05-15'),
    status: 'completed'
  },
  {
    id: '5',
    type: 'credit',
    amount: 5000,
    description: 'Remboursement Jean',
    date: new Date('2023-05-05'),
    status: 'completed'
  },
];

export default function HistoriquePage() {
  const [filter, setFilter] = useState('all');
  const router = useRouter();

  const filteredTransactions = filter === 'all' 
    ? tempTransactions 
    : tempTransactions.filter(t => t.type === filter);

  return (
    <div className="min-h-screen bg-[#FFF9E6] p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* En-tête avec bouton de retour */}
        <div className="flex items-center mb-6">
          <Link href="/wallet" className="mr-4 p-2 rounded-full hover:bg-[#E8D9A5] transition">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-6 w-6 text-[#2E2307]"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-[#2E2307]">Historique des transactions</h1>
        </div>

        {/* Filtres */}
        <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
          {[
            { value: 'all', label: 'Toutes' },
            { value: 'credit', label: 'Recharges' },
            { value: 'debit', label: 'Dépenses' }
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${
                filter === item.value
                  ? 'bg-[#2E2307] text-[#FDBC01]'
                  : 'bg-white text-[#2E2307] border border-[#E8D9A5]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Liste des transactions */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {filteredTransactions.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              Aucune transaction trouvée
            </div>
          ) : (
            <ul className="divide-y divide-[#E8D9A5]">
              {filteredTransactions.map((transaction) => (
                <li key={transaction.id} className="p-4 hover:bg-[#FFF9E6] transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-[#2E2307]">{transaction.description}</p>
                      <p className="text-sm text-[#5A4A1A] mt-1">
                        {transaction.date.toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <p className={`font-semibold ${
                      transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.type === 'credit' ? '+' : '-'}{transaction.amount.toLocaleString()} FCFA
                    </p>
                  </div>
                  {transaction.status === 'pending' && (
                    <div className="mt-2 flex items-center">
                      <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1"></span>
                      <span className="text-xs text-yellow-700">En attente</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Statistiques */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-green-800">Total crédits</p>
            <p className="text-xl font-bold text-green-600">
              {tempTransactions
                .filter(t => t.type === 'credit')
                .reduce((sum, t) => sum + t.amount, 0)
                .toLocaleString()} FCFA
            </p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-sm text-red-800">Total débits</p>
            <p className="text-xl font-bold text-red-600">
              {tempTransactions
                .filter(t => t.type === 'debit')
                .reduce((sum, t) => sum + t.amount, 0)
                .toLocaleString()} FCFA
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}