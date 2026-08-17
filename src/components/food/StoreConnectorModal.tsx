'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  listenToImportProgress,
  saveStoreIntegration,
  startRestaurantStoreSync,
  testStoreConnection,
} from '@/services/menu-import-client.service';
import type { MenuImportJob } from '@/types/food-delivery';
import type { Unsubscribe } from 'firebase/firestore';

interface StoreConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  onSyncCompleted?: () => void;
}

export const StoreConnectorModal: React.FC<StoreConnectorModalProps> = ({
  isOpen,
  onClose,
  restaurantId,
  onSyncCompleted,
}) => {
  const [siteUrl, setSiteUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [importJob, setImportJob] = useState<MenuImportJob | null>(null);
  const [showErrorsList, setShowErrorsList] = useState(false);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  const cleanupSubscription = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupSubscription();
    };
  }, []);

  const handleClose = () => {
    cleanupSubscription();
    // Wipe sensitive keys from in-memory state on close
    setSiteUrl('');
    setConsumerKey('');
    setConsumerSecret('');
    setTestResult(null);
    setSaveResult(null);
    setErrorMessage(null);
    setIsTesting(false);
    setIsSaving(false);
    setIsSyncing(false);
    setImportJob(null);
    onClose();
  };

  const validateInputs = (): boolean => {
    setErrorMessage(null);
    const trimmedUrl = siteUrl.trim();
    if (!trimmedUrl) {
      setErrorMessage("L'URL de votre boutique est requise");
      return false;
    }
    if (!trimmedUrl.startsWith('https://')) {
      setErrorMessage("L'URL de la boutique doit obligatoirement commencer par https://");
      return false;
    }
    if (!consumerKey.trim()) {
      setErrorMessage('La clé client (Consumer Key) est requise');
      return false;
    }
    if (!consumerSecret.trim()) {
      setErrorMessage('Le secret client (Consumer Secret) est requis');
      return false;
    }
    return true;
  };

  const handleTestConnection = async () => {
    if (!validateInputs() || !restaurantId) return;

    try {
      setIsTesting(true);
      setTestResult(null);
      setErrorMessage(null);

      const result = await testStoreConnection({
        restaurantId,
        siteUrl: siteUrl.trim(),
        consumerKey: consumerKey.trim(),
        consumerSecret: consumerSecret.trim(),
      });

      setTestResult(result);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Échec du test de connexion',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveIntegration = async () => {
    if (!validateInputs() || !restaurantId) return;

    try {
      setIsSaving(true);
      setSaveResult(null);
      setErrorMessage(null);

      const result = await saveStoreIntegration({
        restaurantId,
        siteUrl: siteUrl.trim(),
        consumerKey: consumerKey.trim(),
        consumerSecret: consumerSecret.trim(),
      });

      setSaveResult(result);
    } catch (err: unknown) {
      setSaveResult({
        success: false,
        message: err instanceof Error ? err.message : "Échec de l'enregistrement de l'intégration",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartSync = async () => {
    if (!restaurantId) return;

    try {
      setIsSyncing(true);
      setErrorMessage(null);
      setImportJob(null);

      // If keys are provided in form, save them first
      if (siteUrl.trim() && consumerKey.trim() && consumerSecret.trim()) {
        await saveStoreIntegration({
          restaurantId,
          siteUrl: siteUrl.trim(),
          consumerKey: consumerKey.trim(),
          consumerSecret: consumerSecret.trim(),
        });
      }

      const { importId } = await startRestaurantStoreSync({
        restaurantId,
        integrationId: 'woocommerce',
      });

      cleanupSubscription();
      unsubscribeRef.current = listenToImportProgress(
        restaurantId,
        importId,
        (job) => {
          setImportJob(job);
          if (job.status === 'completed') {
            setIsSyncing(false);
            if (onSyncCompleted) {
              onSyncCompleted();
            }
          } else if (job.status === 'failed') {
            setIsSyncing(false);
          }
        },
        (error) => {
          setErrorMessage(error.message || 'Erreur lors du suivi de la synchronisation');
          setIsSyncing(false);
        }
      );
    } catch (err: unknown) {
      setIsSyncing(false);
      setErrorMessage(err instanceof Error ? err.message : 'Échec du lancement de la synchronisation');
    }
  };

  if (!isOpen) return null;

  const total = importJob?.totalItems || 0;
  const processed = importJob?.processedItems || 0;
  const failed = importJob?.failedItems || 0;
  const progressPercent = total > 0 ? Math.min(100, Math.round(((processed + failed) / total) * 100)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 md:p-8 flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 id="store-modal-title" className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>🛒</span> Connecter une boutique WooCommerce
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Synchronisez automatiquement votre catalogue WooCommerce vers votre menu Medjira
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Fermer"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="py-6 space-y-5 flex-1">
          {/* Security Notice */}
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-3">
            <span className="text-base">🔒</span>
            <div className="leading-relaxed">
              <span className="font-semibold">Sécurité de niveau bancaire :</span> Vos identifiants API sont
              chiffrés avec <span className="font-mono font-bold">AES-256-GCM</span> côté serveur. Ils ne sont jamais
              stockés sur votre navigateur ni exposés publiquement.
            </div>
          </div>

          {/* Form Fields */}
          {!importJob && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
                  URL de la boutique (HTTPS)
                </label>
                <input
                  type="url"
                  placeholder="https://mon-restaurant.com"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
                    Consumer Key (ck_...)
                  </label>
                  <input
                    type="text"
                    placeholder="ck_xxxxxxxxxxxxxxxx"
                    value={consumerKey}
                    onChange={(e) => setConsumerKey(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
                    Consumer Secret (cs_...)
                  </label>
                  <input
                    type="password"
                    placeholder="cs_xxxxxxxxxxxxxxxx"
                    value={consumerSecret}
                    onChange={(e) => setConsumerSecret(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {/* Action Buttons: Test Connection & Save */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || isSaving || isSyncing}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition-colors min-h-[44px] flex items-center gap-2"
                >
                  {isTesting ? '🔄 Test en cours...' : '🔌 Tester la connexion'}
                </button>

                <button
                  type="button"
                  onClick={handleSaveIntegration}
                  disabled={isTesting || isSaving || isSyncing}
                  className="px-4 py-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-xs font-semibold transition-colors min-h-[44px] flex items-center gap-2"
                >
                  {isSaving ? '💾 Enregistrement...' : '💾 Enregistrer la configuration'}
                </button>
              </div>
            </div>
          )}

          {/* Test or Save Result Alerts */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              <span>{testResult.success ? '✅' : '❌'}</span>
              <div>{testResult.message}</div>
            </div>
          )}

          {saveResult && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                saveResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              <span>{saveResult.success ? '✅' : '❌'}</span>
              <div>{saveResult.message}</div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
              <span>⚠️</span>
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Real-time Sync Progress */}
          {importJob && (
            <div className="space-y-4 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
                  Synchronisation du catalogue WooCommerce
                </span>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    importJob.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : importJob.status === 'failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse'
                  }`}
                >
                  {importJob.status === 'pending' && 'Démarrage...'}
                  {importJob.status === 'processing' && 'Synchronisation en cours...'}
                  {importJob.status === 'completed' && 'Synchronisation réussie'}
                  {importJob.status === 'failed' && 'Échec'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    importJob.status === 'completed'
                      ? 'bg-emerald-500'
                      : importJob.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                  }`}
                  style={{
                    width:
                      importJob.status === 'completed'
                        ? '100%'
                        : `${total > 0 ? progressPercent : 25}%`,
                  }}
                />
              </div>

              {/* Stats Counters */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-zinc-500 dark:text-zinc-400">Total produits</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100 text-base">{total || '—'}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-emerald-600 dark:text-emerald-400">Synchronisés</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-300 text-base">{processed}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-red-600 dark:text-red-400">Ignorés / Erreurs</div>
                  <div className="font-bold text-red-700 dark:text-red-300 text-base">{failed}</div>
                </div>
              </div>

              {/* Errors List */}
              {importJob.errors && importJob.errors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setShowErrorsList(!showErrorsList)}
                    className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline flex items-center justify-between w-full"
                  >
                    <span>{importJob.errors.length} anomalie(s)</span>
                    <span>{showErrorsList ? '▲ Masquer' : '▼ Voir les détails'}</span>
                  </button>

                  {showErrorsList && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-red-50/50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-xs">
                      {importJob.errors.map((err, idx) => (
                        <div key={idx} className="text-red-700 dark:text-red-300">
                          {err.item && <span className="font-semibold">{err.item} : </span>}
                          <span>{err.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isSyncing && importJob?.status === 'processing'}
            className="px-5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-h-[44px]"
          >
            {importJob?.status === 'completed' ? 'Fermer' : 'Annuler'}
          </button>

          {!importJob && (
            <button
              onClick={handleStartSync}
              disabled={isSyncing || isSaving || isTesting}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm text-white transition-all shadow-md min-h-[44px] ${
                isSyncing || isSaving || isTesting
                  ? 'bg-zinc-400 cursor-not-allowed opacity-60'
                  : 'bg-amber-600 hover:bg-amber-700 active:scale-95'
              }`}
            >
              {isSyncing ? 'Synchronisation...' : 'Synchroniser maintenant'}
            </button>
          )}

          {importJob?.status === 'completed' && (
            <button
              onClick={handleClose}
              className="px-6 py-2.5 rounded-xl font-medium text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md min-h-[44px]"
            >
              Voir le menu mis à jour
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
