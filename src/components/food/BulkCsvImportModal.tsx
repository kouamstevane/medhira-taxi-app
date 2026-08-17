'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  downloadSampleCsvTemplate,
  listenToImportProgress,
  startMenuFileImport,
  uploadMenuImportFile,
} from '@/services/menu-import-client.service';
import type { MenuImportJob } from '@/types/food-delivery';
import type { Unsubscribe } from 'firebase/firestore';

interface BulkCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  onImportCompleted?: () => void;
}

export const BulkCsvImportModal: React.FC<BulkCsvImportModalProps> = ({
  isOpen,
  onClose,
  restaurantId,
  onImportCompleted,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importJob, setImportJob] = useState<MenuImportJob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showErrorsList, setShowErrorsList] = useState(false);

  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);

  // Clean up snapshot listener on close or unmount
  const cleanupSubscription = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  };

  const cancelActiveUpload = () => {
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
  };

  useEffect(() => {
    return () => {
      cancelActiveUpload();
      cleanupSubscription();
    };
  }, []);

  const handleClose = () => {
    if (isProcessing && importJob?.status === 'processing') {
      const confirm = window.confirm(
        "L'importation est en cours de traitement en arrière-plan. Souhaitez-vous fermer la fenêtre ?"
      );
      if (!confirm) return;
    }
    cancelActiveUpload();
    cleanupSubscription();
    setFile(null);
    setUploadProgress(0);
    setIsProcessing(false);
    setImportJob(null);
    setErrorMessage(null);
    onClose();
  };

  const handleFileChange = (selectedFile: File | null) => {
    setErrorMessage(null);
    setImportJob(null);
    if (!selectedFile) {
      setFile(null);
      return;
    }

    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      setErrorMessage('Format de fichier non supporté. Veuillez choisir un fichier .csv ou .xlsx');
      setFile(null);
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      setErrorMessage('Le fichier dépasse la taille maximale autorisée de 15 Mo');
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleStartImport = async () => {
    if (!file || !restaurantId) return;

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setUploadProgress(0);

      const uploadAbortController = new AbortController();
      uploadAbortControllerRef.current = uploadAbortController;
      let uploadResult: Awaited<ReturnType<typeof uploadMenuImportFile>>;
      try {
        uploadResult = await uploadMenuImportFile(restaurantId, file, (progress) => {
          setUploadProgress(progress);
        }, { signal: uploadAbortController.signal });
      } finally {
        if (uploadAbortControllerRef.current === uploadAbortController) {
          uploadAbortControllerRef.current = null;
        }
      }

      const { importId } = await startMenuFileImport({
        ...uploadResult,
        restaurantId,
      });

      cleanupSubscription();
      unsubscribeRef.current = listenToImportProgress(
        restaurantId,
        importId,
        (job) => {
          setImportJob(job);
          if (job.status === 'completed') {
            setIsProcessing(false);
            if (onImportCompleted) {
              onImportCompleted();
            }
          } else if (job.status === 'failed') {
            setIsProcessing(false);
          }
        },
        (error) => {
          setErrorMessage(error.message || "Erreur de suivi de l'importation");
          setIsProcessing(false);
        }
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setIsProcessing(false);
      setErrorMessage(err instanceof Error ? err.message : "Échec du démarrage de l'importation");
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
      aria-labelledby="import-modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 md:p-8 flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 id="import-modal-title" className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Importer un catalogue de plats
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Fichiers acceptés : CSV et Excel XLSX (jusqu'à 10 000 plats, max 15 Mo)
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
        <div className="py-6 space-y-6 flex-1">
          {/* Action Bar / Template Download */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Modèle prêt à l'emploi</span> : Utilisez notre fichier CSV formaté avec les
              colonnes requises.
            </div>
            <button
              onClick={downloadSampleCsvTemplate}
              type="button"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors min-h-[44px] flex items-center gap-2 whitespace-nowrap"
            >
              📥 Télécharger le modèle CSV
            </button>
          </div>

          {/* File Dropzone */}
          {!importJob && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileChange(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                  : file
                  ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/50'
              }`}
            >
              <input
                ref={fileInputRef}
                data-testid="file-input"
                type="file"
                accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center space-y-2">
                <span className="text-4xl">{file ? '📄' : '📁'}</span>
                {file ? (
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} Mo — Cliquez pour remplacer
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">
                      Glissez votre fichier CSV ou XLSX ici
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      ou cliquez pour sélectionner depuis votre ordinateur
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
              <span>⚠️</span>
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Uploading Progress */}
          {isProcessing && uploadProgress < 100 && !importJob && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <span>Téléversement du fichier...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Import Job Real-Time Progress */}
          {importJob && (
            <div className="space-y-4 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
                  Progression du traitement serveur
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
                  {importJob.status === 'pending' && 'En attente...'}
                  {importJob.status === 'processing' && 'Traitement en cours...'}
                  {importJob.status === 'completed' && 'Terminé avec succès'}
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
                        : `${total > 0 ? progressPercent : 20}%`,
                  }}
                />
              </div>

              {/* Stats Counters */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-zinc-500 dark:text-zinc-400">Total plats</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100 text-base">{total || '—'}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-emerald-600 dark:text-emerald-400">Importés</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-300 text-base">{processed}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-red-600 dark:text-red-400">Ignorés / Erreurs</div>
                  <div className="font-bold text-red-700 dark:text-red-300 text-base">{failed}</div>
                </div>
              </div>

              {/* Errors Accordion if any */}
              {importJob.errors && importJob.errors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setShowErrorsList(!showErrorsList)}
                    className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline flex items-center justify-between w-full"
                  >
                    <span>{importJob.errors.length} anomalie(s) détectée(s)</span>
                    <span>{showErrorsList ? '▲ Masquer' : '▼ Voir les détails'}</span>
                  </button>

                  {showErrorsList && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-red-50/50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-xs">
                      {importJob.errors.map((err, idx) => (
                        <div key={idx} className="text-red-700 dark:text-red-300">
                          {err.row && <span className="font-semibold">Ligne {err.row} : </span>}
                          {err.item && <span className="italic font-medium">({err.item}) </span>}
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
            disabled={isProcessing && importJob?.status === 'processing'}
            className="px-5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-h-[44px]"
          >
            {importJob?.status === 'completed' ? 'Fermer' : 'Annuler'}
          </button>

          {!importJob && (
            <button
              onClick={handleStartImport}
              disabled={!file || isProcessing}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm text-white transition-all shadow-md min-h-[44px] ${
                !file || isProcessing
                  ? 'bg-zinc-400 cursor-not-allowed opacity-60'
                  : 'bg-amber-600 hover:bg-amber-700 active:scale-95'
              }`}
            >
              {isProcessing ? 'Importation...' : "Lancer l'importation"}
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
