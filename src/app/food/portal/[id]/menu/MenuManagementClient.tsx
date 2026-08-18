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
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { ERROR_MESSAGES, CURRENCY_CODE } from '@/utils/constants';
import type { MenuItem } from '@/types';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';
import { getRestaurantPortalPath } from '../../restaurant-portal-paths';
import { FileDown, ShoppingCart } from 'lucide-react';
import { MenuCatalogToolbar } from '@/components/restaurant/menu/MenuCatalogToolbar';
import { MenuCatalogTable } from '@/components/restaurant/menu/MenuCatalogTable';
import { MenuCatalogPagination } from '@/components/restaurant/menu/MenuCatalogPagination';
import { useMenuCatalogQuery } from '@/hooks/useMenuCatalogQuery';

function getMenuItemSaveErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

  if (code === 'unauthenticated') {
    return 'Votre session a expiré. Reconnectez-vous avant de modifier le menu.';
  }
  if (code === 'permission-denied') {
    return 'Vous n’avez pas les droits pour modifier ce menu.';
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
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const catalog = useMenuCatalogQuery(restaurantId);
  const menuItems = catalog.items;

  // Dynamic Categories calculation
  const dynamicCategories = useMemo(() => {
    const fromItems = Array.from(
      new Set(
        menuItems
          .map((item) => item.category?.trim())
          .filter(Boolean) as string[]
      )
    );
    const combined = Array.from(new Set([...DEFAULT_CATEGORIES, ...fromItems]));
    return combined.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  }, [menuItems]);

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
  const modalRef = useRef<HTMLDivElement | null>(null);

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
        setLoading(false);
      } catch (error) {
        console.error('Error loading restaurant:', error);
        showError('Erreur lors du chargement du restaurant');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [id, router, showError]);

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

  // Verrouillage du scroll et gestion de la touche Escape
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        if (isCompressing || isUploading) {
          // Bloquer la fermeture pendant la compression ou l'upload
          return;
        }
        handleAttemptCloseModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, isCompressing, isUploading]);

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
      showError("Impossible de fermer pendant le traitement de l'image");
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
        showError("Veuillez corriger l'URL de l'image avant d'enregistrer");
        return;
      }
    }

    if (imageChoice === 'upload' && !compressedResult) {
      showError("Veuillez sélectionner et compresser une image avant d'enregistrer");
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
          ? `${editingItem ? "Article modifié" : "Article ajouté"}, mais l’ancienne image n’a pas pu être supprimée`
          : (editingItem ? "Article modifié" : "Article ajouté"),
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

      showError(getMenuItemSaveErrorMessage(error));
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
      showError("Erreur de mise à jour");
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm("Supprimer cet article ?")) return;
    try {
      const itemToDelete = menuItems.find((i) => i.id === itemId);
      await FoodDeliveryService.deleteMenuItem(restaurantId, itemId);

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
      showSuccess(
        imageCleanupFailed
          ? "Article supprimé, mais son image n’a pas pu être supprimée"
          : "Article supprimé",
      );
    } catch {
      showError("Erreur de suppression");
    }
  };

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

      {/* Header */}
      <header className="bg-background/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(getRestaurantPortalPath(restaurantId))}
            className="p-2 hover:bg-white/10 rounded-full transition"
          >
            <MaterialIcon name="arrow_back" size="lg" className="text-slate-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Gestion du Menu</h1>
            <p className="text-xs text-slate-500">{catalog.totalCount.toLocaleString('fr-FR')} articles au total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            aria-label="Importer catalogue"
            className="glass-card border border-white/10 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-white/10 transition text-sm min-h-[44px]"
          >
            <FileDown size={17} strokeWidth={2.2} aria-hidden="true" />
            <span className="hidden sm:inline">Importer catalogue</span>
          </button>
          <button
            type="button"
            onClick={() => setIsStoreModalOpen(true)}
            aria-label="Connecter boutique"
            className="glass-card border border-white/10 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-white/10 transition text-sm min-h-[44px]"
          >
            <ShoppingCart size={17} strokeWidth={2.2} aria-hidden="true" />
            <span className="hidden sm:inline">Connecter boutique</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="bg-gradient-to-r from-primary to-[#ffae33] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 primary-glow hover:opacity-90 transition min-h-[44px]"
          >
            <MaterialIcon name="add" size="md" /> Nouveau
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 sm:p-8 sm:pb-28">
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
          onClearFilters={catalog.clearFilters}
        />

        {catalog.error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            <span>{catalog.error}</span>
            <button type="button" onClick={catalog.retry} className="min-h-11 rounded-xl px-3 font-bold hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Réessayer</button>
          </div>
        )}

        {catalog.selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/[0.08] p-3">
            <span className="text-xs font-bold text-primary">{catalog.selectedIds.length} plat(s) sélectionné(s)</span>
            <div className="flex gap-2">
              <button type="button" onClick={async () => { await bulkUpdateMenuItemAvailability(restaurantId, catalog.selectedIds, true); await catalog.reload(); }} className="min-h-11 rounded-xl bg-emerald-500/15 px-3 text-xs font-bold text-emerald-300">Rendre disponibles</button>
              <button type="button" onClick={async () => { await bulkUpdateMenuItemAvailability(restaurantId, catalog.selectedIds, false); await catalog.reload(); }} className="min-h-11 rounded-xl bg-white/[0.06] px-3 text-xs font-bold text-slate-300">Masquer</button>
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
            onDelete={deleteItem}
          />
        )}

        {!catalog.isLoading && catalog.items.length === 0 && catalog.totalCount === 0 && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <MaterialIcon name="menu_book" size="xl" className="text-slate-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Votre menu est vide</h3>
            <p className="text-slate-400 mb-8">
              Commencez par ajouter votre premier plat pour attirer des clients !
            </p>
            <button
              onClick={() => handleOpenModal()}
              className="bg-primary text-white px-8 py-3 rounded-2xl font-bold primary-glow hover:opacity-90 transition min-h-[44px]"
            >
              Ajouter un plat
            </button>
          </div>
        )}

        {!catalog.isLoading && catalog.items.length === 0 && catalog.totalCount > 0 && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-16 text-center">
            <MaterialIcon name="search_off" size="xl" className="mx-auto mb-4 text-slate-500" />
            <h3 className="text-lg font-bold text-white">Aucun plat trouvé</h3>
            <p className="mt-2 text-sm text-slate-500">Modifiez votre recherche ou réinitialisez les filtres.</p>
            <button type="button" onClick={catalog.clearFilters} className="mt-6 min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white">Réinitialiser les filtres</button>
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

      {/* Accessible Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity"
            onClick={handleAttemptCloseModal}
          />

          {/* Dialog Container */}
          <div
            ref={modalRef}
            className="glass-card rounded-3xl w-full max-w-lg relative z-10 overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[90dvh] my-auto"
          >
            {/* Header Sticky */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#1A1A1A]/80 backdrop-blur-md shrink-0">
              <h3 id="modal-title" className="text-xl font-bold text-white">
                {editingItem ? 'Modifier' : 'Ajouter'} un article
              </h3>
              <button
                type="button"
                onClick={handleAttemptCloseModal}
                disabled={isCompressing || isUploading}
                className="p-2 hover:bg-white/10 rounded-full transition text-slate-400 disabled:opacity-30"
              >
                <MaterialIcon name="close" size="lg" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="menu-item-form" onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Nom du plat *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
                  placeholder="Ex: Burger Gourmet Cheese"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Prix ({CURRENCY_CODE}) *
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
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Catégorie *
                  </label>
                  <input
                    type="text"
                    list="category-suggestions"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
                    placeholder="Ex: Plats, Desserts, Burgers..."
                    required
                  />
                  <datalist id="category-suggestions">
                    {dynamicCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {dynamicCategories.slice(0, 6).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm({ ...form, category: cat })}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition ${
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
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white h-20 resize-none"
                  placeholder="Ingrédients, taille, accompagnement..."
                />
              </div>

              {/* ÉDITEUR D'IMAGE ACCESSIBLE */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Image du plat
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
                    Conserver
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
                    Lien externe
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
                    Importer
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
                    Supprimer
                  </button>
                </div>

                {/* Explication secondaire pour chaque option */}
                <p className="text-[11px] text-slate-500 italic">
                  {imageChoice === 'image-unchanged' &&
                    "Conserve l'image actuellement enregistrée sans modification."}
                  {imageChoice === 'external-url' &&
                    "Saisissez une URL directe d'image (ex: Unsplash). Les liens de partage (Google Drive, Photos) sont refusés."}
                  {imageChoice === 'upload' &&
                    "Sélectionnez une image (max 10 Mo). Elle sera automatiquement compressée au format WebP (max 500 Ko)."}
                  {imageChoice === 'remove' &&
                    "Supprime l'image du plat."}
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
                        <MaterialIcon name="refresh" className="animate-spin text-sm" /> Vérification de l'image...
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
                          <MaterialIcon name="refresh" className="animate-spin text-sm" /> Compression WebP en cours...
                        </p>
                        <button
                          type="button"
                          onClick={handleCancelImport}
                          className="text-xs text-destructive hover:underline font-semibold"
                        >
                          Annuler l import
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
                          <p className="font-bold text-white">Image compressée WebP</p>
                          <p className="text-slate-400">
                            {(compressedResult.compressedSize / 1024).toFixed(0)} Ko / 500 Ko max (
                            {compressedResult.compressionRatio.toFixed(0)}% économisés)
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
                          <span className="font-bold text-primary">Envoi vers Firebase Storage...</span>
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
                            {isUploadPaused ? 'Reprendre' : 'Pause'}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelImport}
                            className="text-xs text-destructive hover:underline font-semibold"
                          >
                            Annuler l import
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between py-2 border-t border-white/5">
                <span className="text-sm font-bold text-slate-300">Disponible à la vente</span>
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
                  Annuler
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
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modales d'importation de catalogue */}
      <BulkCsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        restaurantId={restaurantId}
        onImportCompleted={async (job) => {
          if (job.failedItems > 0) {
            showError(`Import terminé avec ${job.failedItems} anomalie(s). Consultez les détails.`);
          } else {
            showSuccess('Catalogue importé avec succès !');
          }
          await catalog.reload();
        }}
      />

      <StoreConnectorModal
        isOpen={isStoreModalOpen}
        onClose={() => setIsStoreModalOpen(false)}
        restaurantId={restaurantId}
        onSyncCompleted={async () => {
          showSuccess('Synchronisation WooCommerce terminée !');
          await catalog.reload();
        }}
      />

      <BottomNav items={portalNavItems(restaurantId)} />
    </div>
  );
}
