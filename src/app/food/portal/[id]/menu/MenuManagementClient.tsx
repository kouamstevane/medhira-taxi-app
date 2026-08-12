"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { FoodDeliveryService, type MenuImageUpdate } from '@/services/food-delivery.service';
import {
  uploadMenuImage,
  deleteMenuImage,
  createMenuItemId,
  getMenuImageStorageErrorMessage,
  type UploadMenuTask,
} from '@/services/menu-image-storage.service';
import { imageCompressionService, type CompressionResult } from '@/services/image-compression.service';
import { useMenuImageUrlValidation } from '@/hooks/useMenuImageUrlValidation';
import { MenuItemImage } from '@/components/food/MenuItemImage';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { ERROR_MESSAGES, CURRENCY_CODE } from '@/utils/constants';
import type { MenuItem } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';
import { getRestaurantPortalPath } from '../../restaurant-portal-paths';

export default function MenuManagementClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('restaurantId')?.trim() || null;
  const restaurantId = id ?? '';
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  const categories = ["Entrées", "Plats", "Desserts", "Boissons", "Accompagnements", "Snacks"];

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
        const items = await FoodDeliveryService.getRestaurantMenuFull(id);
        setMenuItems(items);
      } catch (error) {
        console.error("Error loading menu:", error);
        showError("Erreur lors du chargement du menu");
      } finally {
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
        category: categories[0],
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
        const msg = err instanceof Error ? err.message : 'Échec de la compression de l image';
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
        deleteMenuImage(oldStoragePath).catch((err) => {
          console.error("[MenuManagementClient] Non-fatal cleanup error for old image:", err);
        });
      }

      showSuccess(editingItem ? "Article modifié" : "Article ajouté");

      // Rafraîchir le menu
      const items = await FoodDeliveryService.getRestaurantMenuFull(restaurantId);
      setMenuItems(items);
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

      showError(getMenuImageStorageErrorMessage(error));
    } finally {
      setIsSaving(false);
      setIsUploading(false);
      currentUploadTaskRef.current = null;
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      await FoodDeliveryService.updateMenuItemAvailability(restaurantId, item.id, !item.isAvailable);
      setMenuItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i))
      );
    } catch {
      showError("Erreur de mise à jour");
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm("Supprimer cet article ?")) return;
    try {
      const itemToDelete = menuItems.find((i) => i.id === itemId);
      await FoodDeliveryService.deleteMenuItem(restaurantId, itemId);

      if (itemToDelete?.imageStoragePath) {
        deleteMenuImage(itemToDelete.imageStoragePath).catch(() => {});
      }

      setMenuItems((prev) => prev.filter((i) => i.id !== itemId));
      showSuccess("Article supprimé");
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
            <p className="text-xs text-slate-500">{menuItems.length} articles au total</p>
          </div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-gradient-to-r from-primary to-[#ffae33] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 primary-glow hover:opacity-90 transition"
        >
          <MaterialIcon name="add" size="md" /> Nouveau
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-8">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <MaterialIcon
              name="search"
              size="md"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Rechercher un plat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 glass-input rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory((prev) => (prev === cat ? null : cat))}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-primary text-white font-bold'
                    : 'glass-card border border-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Categories & Items Grid */}
        {categories.map((category) => {
          if (selectedCategory && selectedCategory !== category) return null;
          const categoryItems = menuItems.filter(
            (i) =>
              i.category === category &&
              (!searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()))
          );
          if (categoryItems.length === 0) return null;

          return (
            <section key={category} className="mb-10">
              <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-3">
                <span className="w-1 h-6 bg-primary rounded-full"></span>
                {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className={`glass-card p-4 rounded-3xl border border-white/5 flex gap-4 group hover:border-white/10 transition ${
                      !item.isAvailable ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="w-24 h-24 bg-white/10 rounded-2xl overflow-hidden relative shrink-0">
                      <MenuItemImage
                        src={item.imageUrl}
                        imageStoragePath={item.imageStoragePath}
                        alt={item.name}
                        sizes="96px"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-bold text-white group-hover:text-primary transition">
                            {item.name}
                          </h4>
                          <span className="font-bold text-primary">
                            {formatCurrencyWithCode(item.price)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <button
                          onClick={() => toggleAvailability(item)}
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full transition ${
                            item.isAvailable
                              ? 'bg-green-500/10 text-green-400'
                              : 'bg-white/5 text-slate-500'
                          }`}
                        >
                          {item.isAvailable ? 'Disponible' : 'Indisponible'}
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenModal(item)}
                            className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition"
                          >
                            <MaterialIcon name="edit" size="sm" />
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="p-2 text-slate-500 hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                          >
                            <MaterialIcon name="delete" size="sm" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {menuItems.length === 0 && (
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
              className="bg-gradient-to-r from-primary to-[#ffae33] text-white px-8 py-3 rounded-2xl font-bold primary-glow hover:opacity-90 transition"
            >
              Ajouter un plat
            </button>
          </div>
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
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white appearance-none"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c} value={c} className="bg-[#1A1A1A]">
                        {c}
                      </option>
                    ))}
                  </select>
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
                        <MaterialIcon name="refresh" className="animate-spin text-sm" /> Vérification de l image...
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
      <BottomNav items={portalNavItems(restaurantId)} />
    </div>
  );
}
