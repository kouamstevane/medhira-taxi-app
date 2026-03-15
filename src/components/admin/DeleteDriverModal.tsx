/**
 * Modal de Confirmation de Suppression Définitive des Chauffeurs
 * 
 * Ce composant affiche une fenêtre modale de confirmation avant la suppression
 * définitive et irréversible d'un chauffeur. Il demande à l'administrateur de
 * confirmer explicitement son intention en tapant "SUPPRIMER".
 * 
 * Conformité RGPD : Le modal informe clairement que cette action est irréversible
 * et supprime toutes les données personnelles du chauffeur.
 * 
 * @module DeleteDriverModal
 */

"use client";

import { useState, useEffect } from 'react';
import type { Driver } from '@/app/admin/drivers/page';
import type { DriverDeletionResult } from '@/utils/driver-deletion.service';

interface DeleteDriverModalProps {
  driver: Driver | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (driverId: string) => Promise<DriverDeletionResult>;
}

/**
 * Modal de confirmation de suppression définitive
 */
export default function DeleteDriverModal({
  driver,
  isOpen,
  onClose,
  onConfirm,
}: DeleteDriverModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionResult, setDeletionResult] = useState<DriverDeletionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  // Réinitialiser l'état à la fermeture
  useEffect(() => {
    if (!isOpen) {
      setConfirmationText('');
      setIsDeleting(false);
      setDeletionResult(null);
      setError(null);
      setShowStats(false);
    }
  }, [isOpen]);

  // Confirmer la suppression
  const handleConfirm = async () => {
    if (!driver || confirmationText !== 'SUPPRIMER') {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const result = await onConfirm(driver.id);
      setDeletionResult(result);
      setShowStats(true);
      
      // Fermer le modal après 8 secondes si succès
      //  CORRECTION: Augmenté de 3s à 8s pour laisser le temps de lire les statistiques
      if (result.success) {
        setTimeout(() => {
          onClose();
        }, 8000);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue lors de la suppression';
      setError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  // Annuler et fermer
  const handleCancel = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  // Si le modal n'est pas ouvert, ne rien afficher
  if (!isOpen || !driver) {
    return null;
  }

  const canConfirm = confirmationText === 'SUPPRIMER' && !isDeleting;
  const driverName = `${driver.firstName} ${driver.lastName}`.trim() || driver.email;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-red-600 flex items-center gap-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Suppression Définitive
            </h2>
            {!isDeleting && !showStats && (
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {!showStats ? (
            <>
              {/* Avertissement principal */}
              <div className="mb-6">
                <p className="text-gray-700 text-lg mb-4">
                  Vous êtes sur le point de supprimer définitivement le chauffeur :
                </p>
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="font-bold text-gray-900 text-lg">{driverName}</p>
                  <p className="text-gray-600">{driver.email}</p>
                  <p className="text-gray-600">{driver.phone || driver.phoneNumber}</p>
                </div>
              </div>

              {/* Avertissement critique */}
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-red-700 font-bold text-lg mb-2">ATTENTION - ACTION IRRÉVERSIBLE</p>
                    <ul className="text-red-700 text-sm space-y-1">
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 font-bold">•</span>
                        <span>Cette action est <strong>IRRÉVERSIBLE</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 font-bold">•</span>
                        <span><strong>TOUTES</strong> les données du chauffeur seront supprimées</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 font-bold">•</span>
                        <span>Historique des courses, transactions, documents</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 font-bold">•</span>
                        <span>Aucune récupération possible</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Détails des données supprimées */}
              <div className="bg-gray-100 rounded-lg p-4 mb-6">
                <p className="text-gray-700 font-semibold mb-3">Données qui seront supprimées :</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Profil du chauffeur</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Compte utilisateur</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Portefeuille</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Transactions</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Historique des courses</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Documents (permis, carte grise...)</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Véhicules associés</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Photos de profil</span>
                  </div>
                </div>
              </div>

              {/* Message d'erreur */}
              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                  <p className="text-red-700 font-semibold">Erreur lors de la suppression</p>
                  <p className="text-red-600 text-sm mt-1">{error}</p>
                </div>
              )}

              {/* Champ de confirmation */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pour confirmer, tapez <span className="font-bold text-red-600">SUPPRIMER</span> :
                </label>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value.toUpperCase())}
                  disabled={isDeleting}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Tapez SUPPRIMER pour confirmer"
                  autoComplete="off"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Cette mesure de sécurité empêche les suppressions accidentelles.
                </p>
              </div>
            </>
          ) : (
            /* Résultat de la suppression */
            <div className="text-center">
              {deletionResult?.success ? (
                <>
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                    <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Suppression réussie</h3>
                  <p className="text-gray-600 mb-4">Le chauffeur a été supprimé définitivement.</p>
                  
                  {/* Statistiques de suppression */}
                  <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Détails de la suppression :</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Durée :</span>
                        <span className="font-medium">{deletionResult.duration}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Collections nettoyées :</span>
                        <span className="font-medium">{deletionResult.deletedCollections.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Fichiers supprimés :</span>
                        <span className="font-medium">{deletionResult.deletedFiles}</span>
                      </div>
                      {deletionResult.deletedCollections.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-500 mb-2">Collections concernées :</p>
                          <div className="flex flex-wrap gap-1">
                            {deletionResult.deletedCollections.map((col) => (
                              <span key={col} className="px-2 py-1 bg-gray-200 rounded text-xs text-gray-700">
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mt-4">
                    Cette action a été loguée dans les audits de sécurité.
                  </p>
                </>
              ) : (
                <>
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                    <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Échec de la suppression</h3>
                  <p className="text-gray-600 mb-4">
                    Une erreur est survenue lors de la suppression.
                  </p>
                  {deletionResult?.errors && deletionResult.errors.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-4 text-left mb-4">
                      <p className="text-sm font-semibold text-red-700 mb-2">Erreurs :</p>
                      <ul className="text-xs text-red-600 space-y-1">
                        {deletionResult.errors.map((err, idx) => (
                          <li key={idx}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!showStats && (
          <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancel}
                disabled={isDeleting}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className={`px-6 py-2 rounded-lg font-medium transition ${
                  canConfirm
                    ? 'bg-red-600 text-white hover:bg-red-700 shadow-md'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isDeleting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Suppression...
                  </span>
                ) : (
                  'Supprimer définitivement'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
