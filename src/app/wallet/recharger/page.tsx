"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '../../lib/firebase';
import { doc, runTransaction, collection, setDoc } from 'firebase/firestore';

export default function RechargerPage() {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('om');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Vous devez être connecté pour recharger');
      }

      // Validation du montant
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount < 500) {
        throw new Error('Le montant minimum est de 500 FCFA');
      }

      // Simulation de l'appel API de paiement
      const paymentSuccess = await simulatePaymentAPI(numericAmount, paymentMethod);
      if (!paymentSuccess) {
        throw new Error('Échec du paiement. Veuillez réessayer.');
      }

      // Transaction Firestore
      await processWalletUpdate(user.uid, numericAmount, paymentMethod);

      // Redirection avec message de succès
      router.push(`/wallet?success=${numericAmount.toLocaleString()} FCFA ajoutés avec succès!`);
      
    } catch (err) {
      console.error('Erreur de recharge:', err);
      //setError(err.message || 'Une erreur est survenue');
      setLoading(false);
    }
  };

  const simulatePaymentAPI = async (amount, method) => {
    // Simulation du délai de traitement API
    await new Promise(resolve => setTimeout(resolve, 1500));
    return true; // Simule toujours un succès pour le moment
  };

  const processWalletUpdate = async (userId, amount, method) => {
    const fees = Math.max(amount * 0.01, 100);
    const netAmount = amount - fees;

    const walletRef = doc(db, 'wallets', userId);
    const transactionRef = doc(collection(db, 'transactions'));

    // Transaction atomique
    await runTransaction(db, async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      
      // Création du wallet si inexistant
      if (!walletDoc.exists()) {
        transaction.set(walletRef, {
          balance: netAmount,
          currency: 'FCFA',
          updatedAt: new Date(),
        });
      } else {
        const currentBalance = walletDoc.data().balance || 0;
        transaction.update(walletRef, {
          balance: currentBalance + netAmount,
          updatedAt: new Date(),
        });
      }

      // Enregistrement de la transaction
      transaction.set(transactionRef, {
        userId,
        amount,
        fees,
        netAmount,
        method: method === 'om' ? 'Orange Money' : 'Mobile Money',
        type: 'deposit',
        status: 'completed',
        createdAt: new Date(),
      });
    });
  };

  const presetAmounts = [1000, 5000, 10000, 20000, 50000];

  return (
    <div className="min-h-screen bg-[#FFF9E6] p-4 sm:p-6">
      <div className="max-w-md mx-auto">
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
          <h1 className="text-2xl font-bold text-[#2E2307]">Recharger mon portefeuille</h1>
        </div>

        {/* Carte de formulaire */}
        <div className="bg-white rounded-xl shadow-md p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Montant */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#5A4A1A] mb-2">
                Montant à recharger (FCFA)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min="500"
                className="w-full p-3 border border-[#E8D9A5] rounded-lg focus:ring-[#FDBC01] focus:border-[#FDBC01]"
                placeholder="5000"
              />
              
              {/* Montants prédéfinis */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset.toString())}
                    className={`py-2 px-3 rounded-md text-sm ${amount === preset.toString() 
                      ? 'bg-[#FDBC01] text-[#2E2307] font-bold' 
                      : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Méthode de paiement */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#5A4A1A] mb-2">
                Méthode de paiement
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 p-3 border border-[#E8D9A5] rounded-lg hover:bg-[#FFF9E6] cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="om"
                    checked={paymentMethod === 'om'}
                    onChange={() => setPaymentMethod('om')}
                    className="h-4 w-4 text-[#FDBC01] focus:ring-[#FDBC01]"
                  />
                  <div className="flex items-center">
                    <div className="bg-orange-500 text-white p-1 rounded mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5.5 15a3.5 3.5 0 110-7h13a3.5 3.5 0 010 7h-13z"/>
                      </svg>
                    </div>
                    <span>Orange Money</span>
                  </div>
                </label>
                
                <label className="flex items-center space-x-3 p-3 border border-[#E8D9A5] rounded-lg hover:bg-[#FFF9E6] cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="momo"
                    checked={paymentMethod === 'momo'}
                    onChange={() => setPaymentMethod('momo')}
                    className="h-4 w-4 text-[#FDBC01] focus:ring-[#FDBC01]"
                  />
                  <div className="flex items-center">
                    <div className="bg-green-600 text-white p-1 rounded mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5.5 15a3.5 3.5 0 110-7h13a3.5 3.5 0 010 7h-13z"/>
                      </svg>
                    </div>
                    <span>Mobile Money</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Bouton de soumission */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FDBC01] hover:bg-[#E6A900] text-[#2E2307] font-bold py-3 px-4 rounded-lg transition flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#2E2307]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Traitement...
                </>
              ) : (
                <>Confirmer la recharge</>
              )}
            </button>
          </form>
        </div>

        {/* Information supplémentaire */}
        <div className="mt-4 text-center text-sm text-[#5A4A1A]">
          <p>Frais de recharge: 1% (min. 100 FCFA)</p>
          <p>Le solde sera crédité instantanément après paiement</p>
        </div>
      </div>
    </div>
  );
}