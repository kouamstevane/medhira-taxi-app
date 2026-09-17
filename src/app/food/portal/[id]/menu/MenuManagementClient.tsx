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
import { BottomSheet, NetworkErrorView } from '@/components/ui';
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
        showError(t('restaurantLoadErrorToast'));
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
            <p className="text-[11px] text-slate-500 sm:text-xs">{t('totalArticlesCount', { count: catalog.totalCount.toLocaleString() })}</p>
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
              <MaterialIcon name="menu_book" size="xl" className="text-slate-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('emptyMenuTitle')}</h3>
            <p className="text-slate-400 mb-8">
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
            <MaterialIcon name="search_off" size="xl" className="mx-auto mb-4 text-slate-500" />
            <h3 className="text-lg font-bold text-white">{t('noDishesFound')}</h3>
            <p className="mt-2 text-sm text-slate-500">{t('noDishesFoundDesc')}</p>
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
          canDismiss={!isCompressing && !isUploading}
          className="glass-card border border-white/10 bg-[#1A1A1A]"
        >
          <form id="menu-item-form" onSubmit={handleSubmit} className="space-y-6 p-5 sm:p-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {t('dishNameLabel')}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
                  placeholder={t('dishNamePlaceholder')}
                  required
                />
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {t('priceLabel', { currency: CURRENCY_CODE })}
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
                    placeholder="0.00"
                    step="50"
                    required
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {t('categoryLabel')}
                  </label>
                  <input
                    type="text"
                    list="category-suggestions"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
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
                         className={`max-w-full truncate px-2 py-0.5 rounded-lg text-[11px] font-medium transition ${
                          form.category === cat
                            ? 'bg-primary text-white font-bold'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
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
              <div className="space-y-3 pt-2 border-t border-white/5">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t('dishImageLabel')}
                </label>

                {/* Choix d'action image */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setImageChoice('image-unchanged')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 border ${
                      imageChoice === 'image-unchanged'
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    {t('keepImageBtn')}
                  </button>

                  <button
                    type="button"
                    onClick={() => setImageChoice('external-url')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 border ${
                      imageChoice === 'external-url'
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    {t('externalLinkBtn')}
                  </button>

                  <button
                    type="button"
                    onClick={() => setImageChoice('upload')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 border ${
                      imageChoice === 'upload'
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    {t('importImageBtn')}
                  </button>

                  <button
                    type="button"
                    disabled={!editingItem?.imageUrl && imageChoice === 'image-unchanged'}
                    onClick={() => setImageChoice('remove')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 border ${
                      imageChoice === 'remove'
                        ? 'bg-destructive/20 border-destructive text-destructive'
                        : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 disabled:opacity-40'
                    }`}
                  >
                    {t('deleteImageBtn')}
                  </button>
                </div>

                {/* Explication secondaire pour chaque option */}
                <p className="text-[11px] text-slate-500 italic">
                  {imageChoice === 'image-unchanged' &&
                    t('keepImageHelp')}
                  {imageChoice === 'external-url' &&
                    t('externalLinkHelp')}
                  {imageChoice === 'upload' &&
                    t('importImageHelp')}
                  {imageChoice === 'remove' &&
                    t('deleteImageHelp')}
                </p>

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
                      className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 file:cursor-pointer cursor-pointer"
                    />

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
                          <p className="text-slate-400">
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
                          className="p-1.5 text-slate-400 hover:text-destructive rounded-lg hover:bg-white/5"
                        >
                          <MaterialIcon name="close" size="sm" />
                        </button>
                      </div>
                    )}

                    {isUploading && (
                      <div className="p-3 bg-white/5 border border-primary/20 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-primary">{t('uploadingToStorage')}</span>
                          <span className="text-slate-400">{uploadProgress}%</span>
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

              <div className="flex items-center justify-between py-2 border-t border-white/5">
                <span className="text-sm font-bold text-slate-300">{t('availableForSale')}</span>
                <button
                  type="button"
                  className={`w-12 h-6 rounded-full transition relative ${
                    form.isAvailable ? 'bg-green-500' : 'bg-slate-600'
                  }`}
                  onClick={() => setForm({ ...form, isAvailable: !form.isAvailable })}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                      form.isAvailable ? 'left-7' : 'left-1'
                    }`}
                  ></div>
                </button>
              </div>

              {/* Sticky Footer */}
              <div className="pt-4 flex gap-3 sticky bottom-0 bg-[#1A1A1A]/95 backdrop-blur-md pb-safe">
                <button
                  type="button"
                  onClick={handleAttemptCloseModal}
                  disabled={isCompressing || isUploading}
                  className="flex-1 py-4 glass-card border border-white/10 text-slate-300 font-bold rounded-2xl hover:bg-white/10 transition disabled:opacity-40"
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
                  className="flex-1 py-4 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow hover:opacity-90 transition disabled:opacity-50"
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
