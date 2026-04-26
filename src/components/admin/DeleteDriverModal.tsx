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
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { Driver } from '@/app/admin/drivers/page';
import type { DriverDeletionResult } from '@/utils/driver-deletion.service';

interface DeleteDriverModalProps {
  driver: Driver | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (driverId: string) => Promise<DriverDeletionResult>;
}

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

  useEffect(() => {
    if (!isOpen) {
      setConfirmationText('');
      setIsDeleting(false);
      setDeletionResult(null);
      setError(null);
      setShowStats(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!driver || confirmationText !== 'SUPPRIMER') return;

    setIsDeleting(true);
    setError(null);

    try {
      const result = await onConfirm(driver.id);
      setDeletionResult(result);
      setShowStats(true);

      if (result.success) {
        setTimeout(() => { onClose(); }, 8000);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue lors de la suppression';
      setError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    if (!isDeleting) onClose();
  };

  if (!isOpen || !driver) return null;

  const canConfirm = confirmationText === 'SUPPRIMER' && !isDeleting;
  const driverName = `${driver.firstName} ${driver.lastName}`.trim() || driver.email;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-destructive flex items-center gap-2">
              <MaterialIcon name="warning" size="xl" />
              Suppression Définitive
            </h2>
            {!isDeleting && !showStats && (
              <button onClick={handleCancel} className="text-slate-400 hover:text-white transition p-1 rounded-full hover:bg-white/10">
                <MaterialIcon name="close" size="lg" />
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
                <p className="text-slate-300 text-lg mb-4">
                  Vous êtes sur le point de supprimer définitivement le chauffeur :
                </p>
                <div className="bg-white/5 rounded-xl p-4 mb-4 border border-white/5">
                  <p className="font-bold text-white text-lg">{driverName}</p>
                  <p className="text-slate-400">{driver.email}</p>
                  <p className="text-slate-400">{driver.phone || driver.phoneNumber}</p>
                </div>
              </div>

              {/* Avertissement critique */}
              <div className="bg-destructive/10 border-l-4 border-destructive p-4 mb-6 rounded-r-xl">
                <div className="flex items-start gap-3">
                  <MaterialIcon name="warning" size="lg" className="text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-destructive font-bold text-lg mb-2">ATTENTION - ACTION IRRÉVERSIBLE</p>
                    <ul className="text-destructive/80 text-sm space-y-1">
                      <li className="flex items-start gap-2"><span className="font-bold">•</span><span>Cette action est <strong>IRRÉVERSIBLE</strong></span></li>
                      <li className="flex items-start gap-2"><span className="font-bold">•</span><span><strong>TOUTES</strong> les données du chauffeur seront supprimées</span></li>
                      <li className="flex items-start gap-2"><span className="font-bold">•</span><span>Historique des courses, transactions, documents</span></li>
                      <li className="flex items-start gap-2"><span className="font-bold">•</span><span>Aucune récupération possible</span></li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Détails des données supprimées */}
              <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/5">
                <p className="text-slate-300 font-semibold mb-3">Données qui seront supprimées :</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {['Profil du chauffeur', 'Compte utilisateur', 'Portefeuille', 'Transactions', 'Historique des courses', 'Documents (permis, carte grise...)', 'Véhicules associés', 'Photos de profil'].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-slate-400">
                      <MaterialIcon name="close" size="sm" className="text-destructive" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message d'erreur */}
              {error && (
                <div className="bg-destructive/10 border-l-4 border-destructive p-4 mb-6 rounded-r-xl">
                  <p className="text-destructive font-semibold">Erreur lors de la suppression</p>
                  <p className="text-destructive/80 text-sm mt-1">{error}</p>
                </div>
              )}

              {/* Champ de confirmation */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Pour confirmer, tapez <span className="font-bold text-destructive">SUPPRIMER</span> :
                </label>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value.toUpperCase())}
                  disabled={isDeleting}
                  className="w-full glass-input p-3 rounded-xl focus:ring-2 focus:ring-destructive/30 outline-none text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Tapez SUPPRIMER pour confirmer"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Cette mesure de sécurité empêche les suppressions accidentelles.
                </p>
              </div>
            </>
          ) : (
            /* Résultat de la suppression */
            <div className="text-center">
              {deletionResult?.success ? (
                <>
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-500/10 mb-4">
                    <MaterialIcon name="check_circle" size="xl" className="text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Suppression réussie</h3>
                  <p className="text-slate-400 mb-4">Le chauffeur a été supprimé définitivement.</p>

                  <div className="bg-white/5 rounded-xl p-4 text-left border border-white/5">
                    <p className="text-sm font-semibold text-slate-300 mb-3">Détails de la suppression :</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Durée :</span>
                        <span className="font-medium text-white">{deletionResult.duration}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Collections nettoyées :</span>
                        <span className="font-medium text-white">{deletionResult.deletedCollections.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Fichiers supprimés :</span>
                        <span className="font-medium text-white">{deletionResult.deletedFiles}</span>
                      </div>
                      {deletionResult.deletedCollections.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <p className="text-xs text-slate-500 mb-2">Collections concernées :</p>
                          <div className="flex flex-wrap gap-1">
                            {deletionResult.deletedCollections.map((col) => (
                              <span key={col} className="px-2 py-1 bg-white/5 rounded text-xs text-slate-400 border border-white/5">
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-4">
                    Cette action a été loguée dans les audits de sécurité.
                  </p>
                </>
              ) : (
                <>
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10 mb-4">
                    <MaterialIcon name="error" size="xl" className="text-destructive" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Échec de la suppression</h3>
                  <p className="text-slate-400 mb-4">Une erreur est survenue lors de la suppression.</p>
                  {deletionResult?.errors && deletionResult.errors.length > 0 && (
                    <div className="bg-destructive/10 rounded-xl p-4 text-left mb-4 border border-destructive/20">
                      <p className="text-sm font-semibold text-destructive mb-2">Erreurs :</p>
                      <ul className="text-xs text-destructive/80 space-y-1">
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
          <div className="p-6 border-t border-white/5 bg-white/[0.02] rounded-b-2xl">
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancel}
                disabled={isDeleting}
                className="px-6 py-2 glass-card border border-white/10 text-slate-300 rounded-xl hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className={`px-6 py-2 rounded-xl font-medium transition flex items-center gap-2 ${
                  canConfirm
                    ? 'bg-destructive text-white hover:bg-destructive/90'
                    : 'bg-white/5 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isDeleting ? (
                  <>
                    <MaterialIcon name="progress_activity" size="sm" className="animate-spin" />
                    Suppression...
                  </>
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
