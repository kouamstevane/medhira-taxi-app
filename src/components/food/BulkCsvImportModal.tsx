'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Info,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui';
import {
  MENU_IMPORT_TEMPLATE_URLS,
  listenToImportProgress,
  previewMenuFileImport,
  startMenuFileImport,
  uploadMenuImportFile,
} from '@/services/menu-import-client.service';
import type { MenuImportJob, MenuImportPreview } from '@/types/food-delivery';
import type { MenuImportFileInput } from '@/services/menu-import-client.service';
import type { Unsubscribe } from 'firebase/firestore';
import { validateMenuImportFileHeaders } from '@/utils/menu-import-header-validation';
import { useTranslation } from '@/hooks/useTranslation';

interface BulkCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  onImportCompleted?: (job: MenuImportJob) => void;
}

export const BulkCsvImportModal: React.FC<BulkCsvImportModalProps> = ({
  isOpen,
  onClose,
  restaurantId,
  onImportCompleted,
}) => {
  const { t } = useTranslation('restaurant');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importJob, setImportJob] = useState<MenuImportJob | null>(null);
  const [preview, setPreview] = useState<MenuImportPreview | null>(null);
  const [pendingImport, setPendingImport] = useState<MenuImportFileInput | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [stage, setStage] = useState<'select' | 'review' | 'processing'>('select');
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
      const confirm = window.confirm(t('importCloseConfirm'));
      if (!confirm) return;
    }
    cancelActiveUpload();
    cleanupSubscription();
    setFile(null);
    setUploadProgress(0);
    setIsProcessing(false);
    setImportJob(null);
    setPreview(null);
    setPendingImport(null);
    setSelectedRows(new Set());
    setStage('select');
    setErrorMessage(null);
    onClose();
  };

  const handleFileChange = (selectedFile: File | null) => {
    setErrorMessage(null);
    setImportJob(null);
    setPreview(null);
    setPendingImport(null);
    setSelectedRows(new Set());
    setStage('select');
    setShowErrorsList(false);
    if (!selectedFile) {
      setFile(null);
      return;
    }

    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.zip') && !name.endsWith('.xlsx')) {
      setErrorMessage(t('importUnsupportedFormat'));
      setFile(null);
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      setErrorMessage(t('importFileSizeLimitExceeded'));
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handlePreviewImport = async () => {
    if (!file || !restaurantId) return;

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setUploadProgress(0);

      const localHeaderError = await validateMenuImportFileHeaders(file, t);
      if (localHeaderError) {
        setIsProcessing(false);
        setErrorMessage(localHeaderError);
        return;
      }

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

      const previewInput: MenuImportFileInput = {
        restaurantId,
        ...uploadResult,
      };
      const importPreview = await previewMenuFileImport(previewInput);
      setPendingImport(previewInput);
      setPreview(importPreview);
      setSelectedRows(new Set(importPreview.rows.filter((row) => row.selectable).map((row) => row.rowNumber)));
      setStage('review');
      setIsProcessing(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setIsProcessing(false);
      setErrorMessage(err instanceof Error ? err.message : t('importAnalysisFailed'));
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport || selectedRows.size === 0) return;

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setStage('processing');

      await startMenuFileImport({
        ...pendingImport,
        reviewConfirmed: true,
        includedRowNumbers: [...selectedRows].sort((a, b) => a - b),
      });

      cleanupSubscription();
      unsubscribeRef.current = listenToImportProgress(
        restaurantId,
        pendingImport.importId,
        (job) => {
          setImportJob(job);
          if (job.status === 'completed') {
            setIsProcessing(false);
            setShowErrorsList(job.failedItems > 0);
            if (onImportCompleted) {
              onImportCompleted(job);
            }
          } else if (job.status === 'failed') {
            setIsProcessing(false);
          }
        },
        (error) => {
          setErrorMessage(error.message || t('importTrackingError'));
          setIsProcessing(false);
        }
      );
    } catch (err: unknown) {
      setIsProcessing(false);
      setStage('review');
      setErrorMessage(err instanceof Error ? err.message : t('importStartFailed'));
    }
  };

  const handleBackToFile = () => {
    setPreview(null);
    setPendingImport(null);
    setSelectedRows(new Set());
    setStage('select');
  };

  const toggleRowSelection = (rowNumber: number) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const total = importJob?.totalItems || 0;
  const processed = importJob?.processedItems || 0;
  const failed = importJob?.failedItems || 0;
  const progressPercent = total > 0 ? Math.min(100, Math.round(((processed + failed) / total) * 100)) : 0;
  const completedWithErrors = importJob?.status === 'completed' && failed > 0;

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      onCloseRequest={handleClose}
      title={t('importModalTitle')}
      showCloseButton={!(isProcessing && importJob?.status === 'processing')}
      canDismiss={!(isProcessing && importJob?.status === 'processing')}
      className="border border-white/10 bg-[#18181b] sm:max-w-2xl text-white shadow-2xl"
      contentClassName="min-h-0 overflow-y-auto px-4 pb-0"
    >
      <div className="flex flex-col">
        {file && (stage === 'review' || stage === 'processing') ? (
          <div className="border-b border-white/10 pb-3 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 truncate">
              <FileSpreadsheet aria-hidden="true" className="size-3.5 text-amber-400 shrink-0" />
              <span className="font-medium text-white truncate">{file.name}</span>
              <span className="text-zinc-400 shrink-0">({(file.size / 1024).toFixed(1)} Ko)</span>
            </span>
            <span className="text-emerald-400 font-semibold shrink-0 text-[11px] bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
              {t('importAnalysisSuccess')}
            </span>
          </div>
        ) : (
          <p className="border-b border-white/10 pb-3 text-xs text-slate-300">
            {t('importModalAcceptedFiles')}
          </p>
        )}

        {/* Body */}
        <div className="py-5 space-y-5 flex-1">
          {/* Compact template guidance - only shown when choosing a file */}
          {!importJob && stage === 'select' && (
            <div
              aria-label={t('importTemplatesAria')}
              className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/40"
            >
              <div className="flex items-center gap-1.5">
                <Info aria-hidden="true" className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                  {t('importNeedTemplate')}
                </span>
              </div>
              <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
                <a
                  href={MENU_IMPORT_TEMPLATE_URLS.csv}
                  download="modele-import-menu.csv"
                  aria-label={t('importDownloadCsvAria')}
                  title={t('importDownloadCsvTitle')}
                  className="flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-amber-500 dark:hover:bg-amber-950/30"
                >
                  <FileText aria-hidden="true" className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  {t('importTemplateCsvLabel')}
                  <Download aria-hidden="true" className="size-3 text-zinc-400 dark:text-zinc-300" />
                </a>
                <a
                  href={MENU_IMPORT_TEMPLATE_URLS.zip}
                  download="modele-import-menu.zip"
                  aria-label={t('importDownloadZipAria')}
                  title={t('importDownloadZipTitle')}
                  className="flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-amber-500 dark:hover:bg-amber-950/30"
                >
                  <Archive aria-hidden="true" className="size-3.5 text-blue-600 dark:text-blue-400" />
                  {t('importTemplateZipLabel')}
                  <Download aria-hidden="true" className="size-3 text-zinc-400 dark:text-zinc-300" />
                </a>
                <a
                  href={MENU_IMPORT_TEMPLATE_URLS.xlsx}
                  download="modele-import-menu.xlsx"
                  aria-label={t('importDownloadXlsxAria')}
                  title={t('importDownloadXlsxTitle')}
                  className="flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-amber-500 dark:hover:bg-amber-950/30"
                >
                  <FileSpreadsheet aria-hidden="true" className="size-3.5 text-violet-600 dark:text-violet-400" />
                  {t('importTemplateXlsxLabel')}
                  <Download aria-hidden="true" className="size-3 text-zinc-400 dark:text-zinc-300" />
                </a>
              </div>
            </div>
          )}

          {/* File Dropzone */}
          {!importJob && stage === 'select' && (
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
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/60'
              }`}
            >
              <input
                ref={fileInputRef}
                data-testid="file-input"
                type="file"
                accept=".csv, .zip, .xlsx, application/zip, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).value = '';
                }}
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center space-y-2">
                {file ? (
                  <FileText aria-hidden="true" className="size-9 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <FolderOpen aria-hidden="true" className="size-9 text-zinc-400 dark:text-zinc-300" />
                )}
                {file ? (
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 font-medium">
                      {t('importClickToReplace', { size: (file.size / (1024 * 1024)).toFixed(2) })}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {t('importDropzoneTitle')}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 font-medium mt-1">
                      {t('importDropzoneSubtitle')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div data-testid="menu-import-error" className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p>{errorMessage}</p>
                {(errorMessage.startsWith('Fichier non conforme') ||
                  errorMessage.startsWith('Format de catalogue non conforme') ||
                  errorMessage.startsWith('Invalid catalog format') ||
                  errorMessage.includes('modèle Excel') ||
                  errorMessage.includes('Excel template')) && (
                  <a
                    href={MENU_IMPORT_TEMPLATE_URLS.xlsx}
                    download="modele-import-menu.xlsx"
                    className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                  >
                    {t('importDownloadExcelTemplate')} <Download aria-hidden="true" className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Uploading Progress */}
          {isProcessing && stage === 'select' && uploadProgress < 100 && !importJob && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <span>{t('importUploading')}</span>
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

          {preview && stage === 'review' && (() => {
            const totalIssues = preview.summary.invalidRows + preview.summary.conflictRows;
            const hasIssues = totalIssues > 0;
            const hasUpdates = preview.summary.updateRows > 0;

            return (
              <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base">
                      {t('importReviewSummaryTitle')}
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {t('importReviewSummaryDesc')}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    {t('importSelectedCount', { count: selectedRows.size })}
                  </span>
                </div>

                {/* Smart Adaptive Status Bar */}
                {!hasIssues ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-500 shrink-0" />
                      <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                        {hasUpdates
                          ? `${t('importCountNew', { count: preview.summary.newRows })} · ${t('importCountUpdates', { count: preview.summary.updateRows })}`
                          : t('importAllReadyToImport', { count: preview.summary.totalRows })}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-300/60 dark:border-emerald-700/60">
                      100%
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700/80 p-2 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40">
                      <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
                      <span>{t('importReadyCount', { count: preview.summary.importableRows })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 font-semibold px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40">
                      <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                      <span>{t('importIssuesCount', { count: totalIssues })}</span>
                    </div>
                  </div>
                )}

                {preview.summary.importableRows === 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {t('importNoImportableRows')}
                  </div>
                )}

                <div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {preview.rows.map((row) => {
                      const hasCustomExternalId = Boolean(row.externalId && !row.externalId.startsWith('auto_'));
                      const formattedPrice =
                        row.price !== undefined && row.price !== null && !isNaN(Number(row.price))
                          ? `${Number(row.price).toFixed(2)} CAD`
                          : null;
                      const isSelected = selectedRows.has(row.rowNumber);

                      return (
                        <div
                          key={row.rowNumber}
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={t('importRowAria', { row: row.rowNumber })}
                          tabIndex={0}
                          onClick={() => {
                            if (row.selectable) toggleRowSelection(row.rowNumber);
                          }}
                          onKeyDown={(e) => {
                            if (row.selectable && (e.key === ' ' || e.key === 'Enter')) {
                              e.preventDefault();
                              toggleRowSelection(row.rowNumber);
                            }
                          }}
                          className={`flex items-start gap-3 p-3 text-sm transition-colors select-none ${
                            row.selectable
                              ? 'cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/60 active:bg-zinc-200/50 dark:active:bg-zinc-700/60'
                              : 'bg-zinc-100/70 dark:bg-zinc-900/50'
                          }`}
                        >
                          <div
                            aria-hidden="true"
                            className={`mt-0.5 size-4.5 shrink-0 rounded flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-amber-500 border border-amber-500 text-black'
                                : 'border border-zinc-500 bg-transparent'
                            }`}
                          >
                            {isSelected && (
                              <Check className="size-3 stroke-[3]" />
                            )}
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 min-w-0 font-medium text-zinc-900 dark:text-zinc-100">
                                <span className="text-xs text-zinc-600 dark:text-zinc-300 shrink-0 font-normal">
                                  {t('importRowNumber', { row: row.rowNumber })}
                                </span>
                                <span className="font-semibold break-words line-clamp-2 leading-tight">
                                  {row.name || t('importNoName')}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  row.status === 'new'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : row.status === 'update'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                    : row.status === 'conflict'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                }`}
                              >
                                {row.status === 'new'
                                  ? t('importStatusNew')
                                  : row.status === 'update'
                                  ? t('importStatusUpdate')
                                  : row.status === 'conflict'
                                  ? t('importStatusConflict')
                                  : t('importStatusInvalid')}
                              </span>
                            </span>

                            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                              <span className="truncate">
                                {hasCustomExternalId && (
                                  <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-300 mr-1.5">
                                    #{row.externalId}
                                  </span>
                                )}
                                {row.category || ''}
                              </span>
                              {formattedPrice && (
                                <span className="shrink-0 font-semibold text-zinc-900 dark:text-zinc-200">
                                  {formattedPrice}
                                </span>
                              )}
                            </span>

                            {row.error && (
                              <span className="mt-1 block text-xs text-red-700 dark:text-red-300 font-medium">
                                {row.error}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Import Job Real-Time Progress */}
          {importJob && (
            <div className="space-y-4 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
                  {t('importServerProgressTitle')}
                </span>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    importJob.status === 'completed' && !completedWithErrors
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : completedWithErrors
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : importJob.status === 'failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse'
                  }`}
                >
                  {importJob.status === 'pending' && t('importJobPending')}
                  {importJob.status === 'processing' && t('importJobProcessing')}
                  {importJob.status === 'completed' && !completedWithErrors && t('importJobSuccess')}
                  {completedWithErrors && t('importJobCompletedWithIssues')}
                  {importJob.status === 'failed' && t('importJobFailed')}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    importJob.status === 'completed' && !completedWithErrors
                      ? 'bg-emerald-500'
                      : completedWithErrors
                      ? 'bg-amber-500'
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
                  <div className="text-zinc-600 dark:text-zinc-300 font-medium">{t('importTotalDishes')}</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100 text-base">{total || '—'}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-emerald-600 dark:text-emerald-400">{t('importProcessedDishes')}</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-300 text-base">{processed}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-red-600 dark:text-red-400">{t('importFailedDishes')}</div>
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
                    <span>{t('importIssuesDetected', { count: importJob.errors.length })}</span>
                    <span>{showErrorsList ? t('importHideErrors') : t('importShowErrors')}</span>
                  </button>

                  {showErrorsList && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-red-50/50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-xs">
                      {importJob.errors.map((err, idx) => (
                        <div key={idx} className="text-red-700 dark:text-red-300">
                          {err.row && <span className="font-semibold">{t('importRowNumber', { row: err.row })} : </span>}
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

        {/* Sticky Footer Actions */}
        <div className="pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/10 flex items-center gap-3 sticky bottom-0 bg-[#18181b]/98 backdrop-blur-md mt-6">
          {stage !== 'review' && (
            <button
              onClick={handleClose}
              disabled={isProcessing && importJob?.status === 'processing'}
              className="flex-1 py-3.5 glass-card border border-white/10 text-slate-200 font-bold rounded-2xl hover:bg-white/10 transition disabled:opacity-40 min-h-[48px]"
            >
              {importJob?.status === 'completed' ? t('importClose') : t('importCancel')}
            </button>
          )}

          {!importJob && stage === 'select' && (
            <button
              onClick={handlePreviewImport}
              disabled={!file || isProcessing}
              className={`flex-1 py-3.5 font-bold text-sm text-white rounded-2xl transition-all shadow-md min-h-[48px] ${
                !file || isProcessing
                  ? 'bg-white/10 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-primary to-[#ffae33] primary-glow hover:opacity-90 active:scale-98'
              }`}
            >
              {isProcessing ? t('importAnalyzingFile') : t('importAnalyzeFile')}
            </button>
          )}

          {!importJob && stage === 'review' && (
            <>
              <button
                onClick={handleBackToFile}
                disabled={isProcessing}
                className="px-5 py-3.5 glass-card border border-white/10 text-slate-200 font-bold text-sm rounded-2xl hover:bg-white/10 transition min-h-[48px] shrink-0"
              >
                {t('importBackToFile')}
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={selectedRows.size === 0 || isProcessing}
                className="flex-1 py-3.5 font-bold text-sm text-white rounded-2xl transition-all shadow-md min-h-[48px] bg-gradient-to-r from-primary to-[#ffae33] primary-glow hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed px-4 text-center"
              >
                {t('importConfirmAndImport', { count: selectedRows.size })}
              </button>
            </>
          )}

          {importJob?.status === 'completed' && (
            <button
              onClick={handleClose}
              className="flex-1 py-3.5 font-bold text-sm text-white rounded-2xl transition-all shadow-md min-h-[48px] bg-gradient-to-r from-primary to-[#ffae33] primary-glow hover:opacity-90"
            >
              {t('importViewUpdatedMenu')}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
};
