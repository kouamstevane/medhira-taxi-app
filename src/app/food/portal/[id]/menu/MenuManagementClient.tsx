"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { FoodDeliveryService, bulkUpdateMenuItemAvailability, type MenuImageUpdate } from '@/services/food-delivery.service';
import {
  uploadMenuImage,
  deleteMenuImage,
  createMenuItemId,
  getMenuImageStorageErrorMessage,
  type UploadMenuTask,
} from '@/services/menu-image-storage.service';
import { imageCompressionService, type CompressionResult } from '@/services/image-compression.service';
import { useMenuImageUrlValidation } from '@/hooks/useMenuImageUrlValidation';
import { BulkCsvImportModal } from '@/components/food/BulkCsvImportModal';
import { StoreConnectorModal } from '@/components/food/StoreConnectorModal';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BottomSheet, NetworkErrorView, MaterialSwitch } from '@/components/ui';
import { isFirestoreNetworkError } from '@/utils/firestore-error-handler';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { ERROR_MESSAGES, CURRENCY_CODE } from '@/utils/constants';
import type { MenuItem } from '@/types';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';
import { FileDown, ShoppingCart } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { MenuCatalogToolbar } from '@/components/restaurant/menu/MenuCatalogToolbar';
import { MenuCatalogTable } from '@/components/restaurant/menu/MenuCatalogTable';
import { MenuCatalogPagination } from '@/components/restaurant/menu/MenuCatalogPagination';
import { DeleteMenuItemDialog } from '@/components/restaurant/menu/DeleteMenuItemDialog';
import { useMenuCatalogQuery } from '@/hooks/useMenuCatalogQuery';
import { mergeMenuCategories } from '@/utils/menu-categories';

const STORE_CONNECTOR_ENABLED = false;

function getMenuItemSaveErrorMessage(error: unknown, t: (key: string) => string): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

  if (code === 'unauthenticated') {
    return t('sessionExpiredMenu');
  }
  if (code === 'permission-denied') {
    return t('permissionDeniedMenu');
  }
  return getMenuImageStorageErrorMessage(error);
}

const DEFAULT_CATEGORIES = ['Entrées', 'Plats', 'Desserts', 'Boissons', 'Accompagnements', 'Snacks'];

export default function MenuManagementClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('restaurantId')?.trim() || null;
  const restaurantId = id ?? '';
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const { t } = useTranslation('restaurant');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<MenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const catalog = useMenuCatalogQuery(restaurantId);
  const menuItems = catalog.items;

  const recharger = useCallback(() => {
    setIsNetworkError(false);
    catalog.retry();
    setRefreshKey((k) => k + 1);
  }, [catalog]);

  // Dynamic Categories calculation
  const dynamicCategories = useMemo(
    () => mergeMenuCategories(DEFAULT_CATEGORIES, menuItems, catalog.categories),
    [catalog.categories, menuItems],
  );

  // Validation hook pour URLs externes
  const urlValidation = useMenuImageUrlValidation();

  // Mode/Choix d'image : 'image-unchanged' | 'external-url' | 'upload' | 'remove'
  type ImageChoice = 'image-unchanged' | 'external-url' | 'upload' | 'remove';
  const [imageChoice, setImageChoice] = useState<ImageChoice>('image-unchanged');
  const [externalUrl, setExternalUrl] = useState('');

  // États pour l'upload & compression
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [compressedResult, setCompressedResult] = useState<CompressionResult | null>(null);
  const [compressedPreviewUrl, setCompressedPreviewUrl] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionError, setCompressionError] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadPaused, setIsUploadPaused] = useState(false);

  // Refs pour annulation
  const compressionAbortControllerRef = useRef<AbortController | null>(null);
  const currentUploadTaskRef = useRef<UploadMenuTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form states
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    isAvailable: true,
  });

  useEffect(() => {
    if (!id) {
      router.replace('/restaurant/dashboard');
    }
  }, [id, router]);

  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const res = await FoodDeliveryService.getRestaurantById(id);
        if (!res || res.ownerId !== user.uid) {
          router.push('/dashboard');
          return;
        }
        setIsNetworkError(false);
        setLoading(false);
      } catch (error) {
        console.error('Error loading restaurant:', error);
        if (
          isFirestoreNetworkError(error) ||
          (error as Error)?.message?.toLowerCase().includes('offline') ||
          (typeof navigator !== 'undefined' && !navigator.onLine)
        ) {
          setIsNetworkError(true);
        }
        showErrorRef.current(t('restaurantLoadErrorToast'));
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [id, router, refreshKey, t]);

  // Révoquer l'ObjectURL de prévisualisation au démontage ou remplacement
  const cleanupPreview = useCallback(() => {
    if (compressedPreviewUrl) {
      try {
        URL.revokeObjectURL(compressedPreviewUrl);
      } catch {
        // Ignorer si déjà révoqué
      }
      setCompressedPreviewUrl(null);
    }
  }, [compressedPreviewUrl]);

  // Réinitialiser tout l'état de l'éditeur d'image
  const resetImageEditorState = useCallback(() => {
    if (compressionAbortControllerRef.current) {
      compressionAbortControllerRef.current.abort();
      compressionAbortControllerRef.current = null;
    }
    if (currentUploadTaskRef.current) {
      currentUploadTaskRef.current.cancel();
      currentUploadTaskRef.current = null;
    }
    cleanupPreview();
    setSelectedFile(null);
    setCompressedResult(null);
    setIsCompressing(false);
    setCompressionError(null);
    setIsUploading(false);
    setUploadProgress(0);
    setIsUploadPaused(false);
    urlValidation.resetValidation();
  }, [cleanupPreview, urlValidation]);

  // Annuler l'import en cours
  const handleCancelImport = useCallback(() => {
    resetImageEditorState();
    setImageChoice('image-unchanged');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [resetImageEditorState]);

  const handleOpenModal = (item?: MenuItem) => {
    resetImageEditorState();
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name,
        description: item.description || '',
        price: item.price.toString(),
        category: item.category,
        isAvailable: item.isAvailable,
      });
      setImageChoice('image-unchanged');
      setExternalUrl(item.imageUrl || '');
    } else {
      setEditingItem(null);
      setForm({
        name: '',
        description: '',
        price: '',
        category: dynamicCategories[0] || 'Plats',
        isAvailable: true,
      });
      setImageChoice('image-unchanged');
      setExternalUrl('');
    }
    setIsModalOpen(true);
  };

  const handleAttemptCloseModal = () => {
    if (isCompressing || isUploading) {
      showError(t('cannotCloseProcessingToast'));
      return;
    }
    resetImageEditorState();
    setIsModalOpen(false);
  };

  // Gestionnaire de sélection de fichier image
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetImageEditorState();
    setSelectedFile(file);
    setIsCompressing(true);
    setCompressionError(null);

    const controller = new AbortController();
    compressionAbortControllerRef.current = controller;

    try {
      const result = await imageCompressionService.compressImage(file, {
        signal: controller.signal,
        maxOutputBytes: 500 * 1024,
        qualityAttempts: 3,
      });

      if (!controller.signal.aborted) {
        setCompressedResult(result);
        const previewUrl = URL.createObjectURL(result.file);
        setCompressedPreviewUrl(previewUrl);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : "Échec de la compression de l'image";
        setCompressionError(msg);
        showError(msg);
      }
    } finally {
      if (compressionAbortControllerRef.current === controller) {
        setIsCompressing(false);
        compressionAbortControllerRef.current = null;
      }
    }
  };

  // Pause / Reprendre Upload Storage
  const handleTogglePauseUpload = () => {
    if (!currentUploadTaskRef.current) return;
    if (isUploadPaused) {
      currentUploadTaskRef.current.resume();
      setIsUploadPaused(false);
    } else {
      currentUploadTaskRef.current.pause();
      setIsUploadPaused(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.category) {
      showError(ERROR_MESSAGES.REQUIRED_FIELDS);
      return;
    }

    if (imageChoice === 'external-url' && externalUrl.trim()) {
      const isValid = await urlValidation.validateUrl(externalUrl.trim());
      if (!isValid) {
        showError(t('fixImageUrlToast'));
        return;
      }
    }

    if (imageChoice === 'upload' && !compressedResult) {
      showError(t('selectAndCompressToast'));
      return;
    }

    setIsSaving(true);
    let createdStoragePath: string | null = null;
    let oldImageCleanupFailed = false;

    try {
      const itemData: Partial<MenuItem> = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: parseFloat(form.price),
        category: form.category,
        isAvailable: form.isAvailable,
        restaurantId,
        id: editingItem?.id,
      };

      let imageUpdate: MenuImageUpdate = { state: 'image-unchanged' };

      if (imageChoice === 'external-url') {
        imageUpdate = {
          state: 'external-url',
          imageUrl: externalUrl.trim(),
        };
      } else if (imageChoice === 'remove') {
        imageUpdate = { state: 'remove' };
      } else if (imageChoice === 'upload' && compressedResult) {
        setIsUploading(true);
        setUploadProgress(0);

        const itemId = editingItem?.id || createMenuItemId(restaurantId);
        itemData.id = itemId;

        const uploadTask = uploadMenuImage({
          restaurantId,
          itemId,
          file: compressedResult.file,
          onProgress: (progress) => {
            setUploadProgress(progress);
          },
        });

        currentUploadTaskRef.current = uploadTask;
        createdStoragePath = uploadTask.path;

        await uploadTask.complete;
        const downloadUrl = await uploadTask.getDownloadURL();

        imageUpdate = {
          state: 'upload',
          imageUrl: downloadUrl,
          imageStoragePath: uploadTask.path,
        };
      } else if (imageChoice === 'image-unchanged') {
        imageUpdate = {
          state: editingItem ? 'image-unchanged' : 'image-none',
        };
      }

      // Enregistrement Firestore
      await FoodDeliveryService.upsertMenuItem(restaurantId, itemData, imageUpdate);

      // Si le document contenait une ancienne image Storage et qu'elle a été remplacée ou supprimée
      const oldStoragePath = editingItem?.imageStoragePath;
      if (
        oldStoragePath &&
        (imageChoice === 'upload' || imageChoice === 'external-url' || imageChoice === 'remove')
      ) {
        try {
          await deleteMenuImage(oldStoragePath);
        } catch (err) {
          oldImageCleanupFailed = true;
          console.error("[MenuManagementClient] Non-fatal cleanup error for old image:", err);
        }
      }

      showSuccess(
        oldImageCleanupFailed
          ? t('itemUpdateCleanupFailedToast', { prefix: editingItem ? t('itemUpdatedToast') : t('itemAddedToast') })
          : (editingItem ? t('itemUpdatedToast') : t('itemAddedToast')),
      );

      // Rafraîchir le menu
      await catalog.reload();
      resetImageEditorState();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving item:", error);

      // Compensation en cas d'échec de la sauvegarde Firestore : supprimer l'objet qu'on vient d'uploader
      if (createdStoragePath) {
        try {
          await deleteMenuImage(createdStoragePath);
        } catch (cleanupErr) {
          console.error("[MenuManagementClient] Compensatory cleanup failed:", cleanupErr);
        }
      }

      showError(getMenuItemSaveErrorMessage(error, t as unknown as (key: string) => string));
    } finally {
      setIsSaving(false);
      setIsUploading(false);
      currentUploadTaskRef.current = null;
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      await FoodDeliveryService.updateMenuItemAvailability(restaurantId, item.id, !item.isAvailable);
      await catalog.reload();
    } catch {
      showError(t('updateItemErrorToast'));
    }
  };

  const requestDeleteItem = (itemId: string) => {
    const item = menuItems.find((menuItem) => menuItem.id === itemId);
    if (item) setPendingDeleteItem(item);
  };

  const confirmDeleteItem = async () => {
    if (!pendingDeleteItem || isDeleting) return;
    const itemToDelete = pendingDeleteItem;
    setIsDeleting(true);
    try {
      await FoodDeliveryService.deleteMenuItem(restaurantId, itemToDelete.id);

      let imageCleanupFailed = false;
      if (itemToDelete?.imageStoragePath) {
        try {
          await deleteMenuImage(itemToDelete.imageStoragePath);
        } catch (error) {
          imageCleanupFailed = true;
          console.error("[MenuManagementClient] Menu image cleanup failed after item deletion:", error);
        }
      }

      await catalog.reload();
      setPendingDeleteItem(null);
      showSuccess(
        imageCleanupFailed
          ? t('itemDeleteCleanupFailedToast')
          : t('itemDeletedToast'),
      );
    } catch {
      showError(t('deleteItemErrorToast'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isNetworkError && (loading || !id)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="bg-background/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-center">
          <h1 className="text-xl font-bold text-white">{t('menuTitle')}</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <NetworkErrorView
            message={t('networkErrorRestoInfo')}
            onRetry={recharger}
          />
        </div>
      </div>
    );
  }

  if (loading || !id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {pendingDeleteItem && (
        <DeleteMenuItemDialog
          item={pendingDeleteItem}
          onCancel={() => {
            if (!isDeleting) setPendingDeleteItem(null);
          }}
          onConfirm={() => void confirmDeleteItem()}
          isProcessing={isDeleting}
        />
      )}

      {/* Header */}
      <header className="bg-background/90 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-2.5 sm:px-8 sm:py-4">
        <div className="flex min-w-0 items-center justify-between gap-2.5 sm:gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-white sm:text-xl">{t('menuTitle')}</h1>
            <p className="text-[11px] text-slate-300 font-medium sm:text-xs">{t('totalArticlesCount', { count: catalog.totalCount.toLocaleString() })}</p>
          </div>
        </div>
        <div className="mt-2 flex w-full gap-2 sm:mt-0 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            aria-label={t('importCatalog')}
            className="glass-card border border-white/10 text-white flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 font-bold transition hover:bg-white/10 sm:h-[44px] sm:w-auto sm:flex-none sm:px-4"
          >
            <FileDown size={17} strokeWidth={2.2} aria-hidden="true" />
            <span className="sm:hidden">{t('importCatalogShort')}</span>
            <span className="hidden sm:inline">{t('importCatalog')}</span>
          </button>
          {STORE_CONNECTOR_ENABLED && (
            <button
              type="button"
              onClick={() => setIsStoreModalOpen(true)}
              aria-label={t('connectStore')}
              className="glass-card border border-white/10 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-white/10 transition text-sm min-h-[44px]"
            >
              <ShoppingCart size={17} strokeWidth={2.2} aria-hidden="true" />
              <span className="hidden sm:inline">{t('connectStore')}</span>
            </button>
          )}
          <button
            onClick={() => handleOpenModal()}
            type="button"
            className="glass-card border border-white/10 text-white flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 font-bold transition hover:bg-white/10 sm:h-[44px] sm:w-auto sm:flex-none sm:px-4 sm:gap-2"
          >
            <MaterialIcon name="add" size="md" className="text-primary" />
            <span className="sm:hidden">{t('newItemShort')}</span>
            <span className="hidden sm:inline">{t('newItem')}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-2.5 pb-24 sm:space-y-6 sm:p-8 sm:pb-28">
        <MenuCatalogToolbar
          search={catalog.search}
          category={catalog.category}
          categories={dynamicCategories}
          availability={catalog.availability}
          sort={catalog.sort}
            totalCount={catalog.totalCount}
            availableCount={catalog.availableCount}
          onSearchChange={catalog.setSearch}
          onCategoryChange={catalog.setCategory}
            onAvailabilityChange={catalog.setAvailability}
            onSortChange={catalog.setSort}
          />

        {catalog.error && !catalog.isNetworkError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            <span>{catalog.error}</span>
            <button type="button" onClick={catalog.retry} className="min-h-11 rounded-xl px-3 font-bold hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t('retry')}</button>
          </div>
        )}

        {catalog.selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/[0.08] p-3">
            <span className="text-xs font-bold text-primary">{t('itemsSelectedCount', { count: catalog.selectedIds.length })}</span>
            <div className="flex gap-2">
              <button type="button" onClick={async () => { await bulkUpdateMenuItemAvailability(restaurantId, catalog.selectedIds, true); await catalog.reload(); }} className="min-h-11 rounded-xl bg-emerald-500/15 px-3 text-xs font-bold text-emerald-300">{t('makeAvailable')}</button>
              <button type="button" onClick={async () => { await bulkUpdateMenuItemAvailability(restaurantId, catalog.selectedIds, false); await catalog.reload(); }} className="min-h-11 rounded-xl bg-white/[0.06] px-3 text-xs font-bold text-slate-300">{t('hideSelected')}</button>
            </div>
          </div>
        )}

        {!catalog.isLoading && catalog.items.length > 0 && (
          <MenuCatalogTable
            items={catalog.items}
            selectedIds={catalog.selectedIds}
            onSelect={catalog.toggleSelected}
            onSelectAll={catalog.toggleAllVisible}
            onToggleAvailability={toggleAvailability}
            onEdit={handleOpenModal}
            onDelete={requestDeleteItem}
          />
        )}

        {!catalog.isLoading && (isNetworkError || catalog.isNetworkError) && catalog.items.length === 0 && (
          <div className="py-12">
            <NetworkErrorView
              message={t('networkErrorMenu')}
              onRetry={recharger}
            />
          </div>
        )}

        {!catalog.isLoading && !isNetworkError && !catalog.isNetworkError && catalog.items.length === 0 && catalog.totalCount === 0 && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <MaterialIcon name="menu_book" size="xl" className="text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('emptyMenuTitle')}</h3>
            <p className="text-slate-300 mb-8">
              {t('emptyMenuDesc')}
            </p>
            <button
              onClick={() => handleOpenModal()}
              className="bg-primary text-white px-8 py-3 rounded-2xl font-bold primary-glow hover:opacity-90 transition min-h-[44px]"
            >
              {t('addItem')}
            </button>
          </div>
        )}

        {!catalog.isLoading && catalog.items.length === 0 && catalog.totalCount > 0 && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-16 text-center">
            <MaterialIcon name="search_off" size="xl" className="mx-auto mb-4 text-slate-400" />
            <h3 className="text-lg font-bold text-white">{t('noDishesFound')}</h3>
            <p className="mt-2 text-sm text-slate-300">{t('noDishesFoundDesc')}</p>
            <button type="button" onClick={catalog.clearFilters} className="mt-6 min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white">{t('resetFilters')}</button>
          </div>
        )}

        {(catalog.items.length > 0 || catalog.totalCount > 0) && (
          <MenuCatalogPagination
            pageIndex={catalog.pageIndex}
            pageSize={catalog.pageSize}
            totalCount={catalog.totalCount}
            hasNextPage={catalog.hasNextPage}
            hasPreviousPage={catalog.hasPreviousPage}
            isLoading={catalog.isLoadingPage}
            onPrevious={catalog.goPrevious}
            onNext={catalog.goNext}
          />
        )}
      </main>

      {isModalOpen && (
        <BottomSheet
          open={isModalOpen}
          title={editingItem ? t('editItem') : t('addItem')}
          onOpenChange={(open) => {
            if (!open) handleAttemptCloseModal();
          }}
          onCloseRequest={handleAttemptCloseModal}
          className="border border-white/10 bg-[#18181b] shadow-2xl"
          contentClassName="min-h-0 overflow-y-auto px-4 pb-0"
        >
          <form id="menu-item-form" onSubmit={handleSubmit} className="space-y-5 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                  {t('dishNameLabel')}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white min-h-[44px]"
                  placeholder={t('dishNamePlaceholder')}
                  required
                />
              </div>

              <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                    {t('priceLabel', { currency: CURRENCY_CODE })}
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white min-h-[44px]"
                    placeholder="0.00"
                    step="50"
                    required
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                    {t('categoryLabel')}
                  </label>
                  <input
                    type="text"
                    list="category-suggestions"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white min-h-[44px]"
                    placeholder={t('categoryPlaceholder')}
                    required
                  />
                  <datalist id="category-suggestions">
                    {dynamicCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                   <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                    {dynamicCategories.slice(0, 6).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm({ ...form, category: cat })}
                         className={`max-w-full truncate px-2.5 py-1 rounded-lg text-xs font-medium transition min-h-[32px] ${
                          form.category === cat
                            ? 'bg-primary text-white font-bold shadow-sm shadow-primary/30'
                            : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                  {t('dishDescLabel')}
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white h-20 resize-none"
                  placeholder={t('dishDescPlaceholder')}
                />
              </div>

              {/* ÉDITEUR D'IMAGE ACCESSIBLE */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      {t('dishImageLabel')}
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                      {t('optionalBadge')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-normal">
                    {t('dishImageSectionSubtitle')}
                  </p>
                </div>

                {/* Choix d'action image sous forme de cartes d'options */}
                <div
                  aria-label={t('dishImageLabel')}
                  className={`grid gap-2 ${editingItem?.imageUrl ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}
                >
                  <button
                    type="button"
                    aria-pressed={imageChoice === 'image-unchanged'}
                    onClick={() => setImageChoice('image-unchanged')}
                    className={`px-3.5 py-3 rounded-xl text-xs font-semibold transition flex items-center justify-between gap-2 border min-h-[48px] ${
                      imageChoice === 'image-unchanged'
                        ? 'bg-primary/15 border-primary text-white shadow-sm shadow-primary/20 ring-1 ring-primary/30'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        imageChoice === 'image-unchanged' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-400'
                      }`}>
                        <MaterialIcon
                          name={editingItem?.imageUrl ? 'image' : 'hide_image'}
                          size="sm"
                        />
                      </div>
                      <span className="truncate">
                        {editingItem?.imageUrl ? t('keepImageBtn') : t('noImageBtn')}
                      </span>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      imageChoice === 'image-unchanged'
                        ? 'border-primary bg-primary/20'
                        : 'border-white/20 bg-black/20'
                    }`}>
                      {imageChoice === 'image-unchanged' && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-pressed={imageChoice === 'upload'}
                    onClick={() => setImageChoice('upload')}
                    className={`px-3.5 py-3 rounded-xl text-xs font-semibold transition flex items-center justify-between gap-2 border min-h-[48px] ${
                      imageChoice === 'upload'
                        ? 'bg-primary/15 border-primary text-white shadow-sm shadow-primary/20 ring-1 ring-primary/30'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        imageChoice === 'upload' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-400'
                      }`}>
                        <MaterialIcon
                          name="cloud_upload"
                          size="sm"
                        />
                      </div>
                      <span className="truncate">{t('importImageBtn')}</span>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      imageChoice === 'upload'
                        ? 'border-primary bg-primary/20'
                        : 'border-white/20 bg-black/20'
                    }`}>
                      {imageChoice === 'upload' && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-pressed={imageChoice === 'external-url'}
                    onClick={() => setImageChoice('external-url')}
                    className={`px-3.5 py-3 rounded-xl text-xs font-semibold transition flex items-center justify-between gap-2 border min-h-[48px] ${
                      imageChoice === 'external-url'
                        ? 'bg-primary/15 border-primary text-white shadow-sm shadow-primary/20 ring-1 ring-primary/30'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        imageChoice === 'external-url' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-400'
                      }`}>
                        <MaterialIcon
                          name="link"
                          size="sm"
                        />
                      </div>
                      <span className="truncate">{t('externalLinkBtn')}</span>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      imageChoice === 'external-url'
                        ? 'border-primary bg-primary/20'
                        : 'border-white/20 bg-black/20'
                    }`}>
                      {imageChoice === 'external-url' && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </button>

                  {editingItem?.imageUrl && (
                    <button
                      type="button"
                      aria-pressed={imageChoice === 'remove'}
                      onClick={() => setImageChoice('remove')}
                      className={`px-3.5 py-3 rounded-xl text-xs font-semibold transition flex items-center justify-between gap-2 border min-h-[48px] ${
                        imageChoice === 'remove'
                          ? 'bg-destructive/20 border-destructive text-white shadow-sm shadow-destructive/20 ring-1 ring-destructive/30'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          imageChoice === 'remove' ? 'bg-destructive/20 text-destructive' : 'bg-white/5 text-slate-400'
                        }`}>
                          <MaterialIcon
                            name="delete_outline"
                            size="sm"
                          />
                        </div>
                        <span className="truncate">{t('deleteImageBtn')}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        imageChoice === 'remove'
                          ? 'border-destructive bg-destructive/20'
                          : 'border-white/20 bg-black/20'
                      }`}>
                        {imageChoice === 'remove' && (
                          <div className="w-2 h-2 rounded-full bg-destructive" />
                        )}
                      </div>
                    </button>
                  )}
                </div>

                {/* Aperçu de l'image actuelle si conservée */}
                {editingItem?.imageUrl && imageChoice === 'image-unchanged' && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="w-12 h-12 rounded-lg overflow-hidden relative bg-black/40 shrink-0 border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editingItem.imageUrl}
                        alt={editingItem.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{t('currentImageLabel')}</p>
                      <p className="text-[11px] text-slate-400 truncate">{editingItem.name}</p>
                    </div>
                  </div>
                )}

                {/* Explication contextuelle pour chaque option avec en-tête explicite */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
                  <MaterialIcon name="info" size="xs" className="text-primary mt-0.5 shrink-0" />
                  <div className="space-y-1 min-w-0">
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <span className="text-primary text-[11px] uppercase tracking-wider font-semibold">
                        {t('activeChoicePrefix')}
                      </span>
                      <span>
                        {imageChoice === 'image-unchanged' &&
                          (editingItem?.imageUrl ? t('keepImageSelectedTitle') : t('noImageSelectedTitle'))}
                        {imageChoice === 'upload' && t('importImageSelectedTitle')}
                        {imageChoice === 'external-url' && t('externalLinkSelectedTitle')}
                        {imageChoice === 'remove' && t('deleteImageSelectedTitle')}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                      {imageChoice === 'image-unchanged' &&
                        (editingItem?.imageUrl ? t('keepImageHelp') : t('noImageHelp'))}
                      {imageChoice === 'upload' && t('importImageHelp')}
                      {imageChoice === 'external-url' && t('externalLinkHelp')}
                      {imageChoice === 'remove' && t('deleteImageHelp')}
                    </p>
                  </div>
                </div>

                {/* Lien Externe Option */}
                {imageChoice === 'external-url' && (
                  <div className="space-y-2 pt-2">
                    <input
                      type="url"
                      value={externalUrl}
                      onChange={(e) => {
                        setExternalUrl(e.target.value);
                        if (e.target.value.trim()) {
                          urlValidation.validateUrl(e.target.value.trim());
                        } else {
                          urlValidation.resetValidation();
                        }
                      }}
                      className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white text-sm"
                      placeholder="https://images.unsplash.com/photo-..."
                    />

                    {urlValidation.isValidating && (
                      <p className="text-xs text-amber-400 flex items-center gap-1">
                        <MaterialIcon name="refresh" className="animate-spin text-sm" /> {t('verifyingImage')}
                      </p>
                    )}

                    {urlValidation.validationError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <MaterialIcon name="error" className="text-sm" /> {urlValidation.validationError}
                      </p>
                    )}
                  </div>
                )}

                {/* Importer Option */}
                {imageChoice === 'upload' && (
                  <div className="space-y-3 pt-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                      onChange={handleFileSelect}
                      disabled={isCompressing || isUploading}
                      className="w-full text-xs text-slate-200 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 file:cursor-pointer cursor-pointer"
                    />

                    {selectedFile && isCompressing && (
                      <p className="text-[11px] text-slate-300 font-medium truncate">
                        {selectedFile.name}
                      </p>
                    )}

                    {compressionError && (
                      <p className="text-xs text-red-400 font-medium flex items-center gap-1.5">
                        <MaterialIcon name="error_outline" size="xs" />
                        {compressionError}
                      </p>
                    )}

                    {isCompressing && (
                      <div className="p-3 bg-white/5 rounded-xl space-y-2">
                        <p className="text-xs text-amber-400 flex items-center gap-2">
                          <MaterialIcon name="refresh" className="animate-spin text-sm" /> {t('compressingWebp')}
                        </p>
                        <button
                          type="button"
                          onClick={handleCancelImport}
                          className="text-xs text-destructive hover:underline font-semibold"
                        >
                          {t('cancelImport')}
                        </button>
                      </div>
                    )}

                    {compressedResult && compressedPreviewUrl && (
                      <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
                        <div className="w-14 h-14 relative rounded-xl overflow-hidden bg-black/20 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={compressedPreviewUrl}
                            alt="Aperçu WebP"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 text-xs space-y-1">
                          <p className="font-bold text-white">{t('compressedWebpImage')}</p>
                          <p className="text-slate-300 font-medium">
                            {t('compressedStats', {
                              size: (compressedResult.compressedSize / 1024).toFixed(0),
                              ratio: compressedResult.compressionRatio.toFixed(0),
                            })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelImport}
                          disabled={isUploading}
                          className="p-1.5 text-slate-300 hover:text-destructive rounded-lg hover:bg-white/5"
                        >
                          <MaterialIcon name="close" size="sm" />
                        </button>
                      </div>
                    )}

                    {isUploading && (
                      <div className="p-3 bg-white/5 border border-primary/20 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-primary">{t('uploadingToStorage')}</span>
                          <span className="text-slate-200 font-semibold">{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={handleTogglePauseUpload}
                            className="text-xs text-slate-300 hover:text-white font-semibold"
                          >
                            {isUploadPaused ? t('resume') : t('pause')}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelImport}
                            className="text-xs text-destructive hover:underline font-semibold"
                          >
                            {t('cancelImport')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between py-3 border-t border-white/10">
                <div className="space-y-0.5 pr-3">
                  <label
                    htmlFor="dish-availability-switch"
                    className="text-sm font-bold text-slate-200 cursor-pointer flex items-center gap-2 select-none"
                  >
                    <MaterialIcon
                      name={form.isAvailable ? "check_circle" : "pause_circle"}
                      size="sm"
                      className={form.isAvailable ? "text-emerald-400" : "text-slate-400"}
                    />
                    {t('availableForSale')}
                  </label>
                  <p className="text-[11px] text-slate-300 font-medium leading-tight">
                    {form.isAvailable
                      ? t('availableForSaleActiveHelp')
                      : t('availableForSaleInactiveHelp')}
                  </p>
                </div>
                <MaterialSwitch
                  id="dish-availability-switch"
                  checked={form.isAvailable}
                  onChange={(checked) => setForm({ ...form, isAvailable: checked })}
                  ariaLabel={t('availableForSale')}
                />
              </div>

              {/* Sticky Footer */}
              <div className="pt-4 flex gap-3 sticky bottom-0 bg-[#18181b]/98 backdrop-blur-md pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/5 mt-6">
                <button
                  type="button"
                  onClick={handleAttemptCloseModal}
                  disabled={isCompressing || isUploading}
                  className="flex-1 py-3.5 glass-card border border-white/10 text-slate-200 font-bold rounded-2xl hover:bg-white/10 transition disabled:opacity-40 min-h-[48px]"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={
                    isSaving ||
                    isCompressing ||
                    isUploading ||
                    urlValidation.isValidating ||
                    (imageChoice === 'upload' && !compressedResult)
                  }
                  className="flex-1 py-3.5 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow hover:opacity-90 transition disabled:opacity-50 min-h-[48px]"
                >
                  {isSaving ? t('savingProgress') : t('save')}
                </button>
              </div>
            </form>
        </BottomSheet>
      )}
      {/* Modales d'importation de catalogue */}
      <BulkCsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        restaurantId={restaurantId}
        onImportCompleted={async (job) => {
          if (job.failedItems > 0) {
            showError(t('importCompletedWithErrors', { count: job.failedItems }));
          } else {
            showSuccess(t('catalogImportedSuccess'));
          }
          await catalog.reload();
        }}
      />

      <StoreConnectorModal
        isOpen={isStoreModalOpen}
        onClose={() => setIsStoreModalOpen(false)}
        restaurantId={restaurantId}
        onSyncCompleted={async () => {
          showSuccess(t('woocommerceSyncSuccess'));
          await catalog.reload();
        }}
      />

      <BottomNav items={portalNavItems(restaurantId)} />
    </div>
  );
}
