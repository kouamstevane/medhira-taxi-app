"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { ERROR_MESSAGES } from '@/utils/constants';
import type { Restaurant, MenuItem } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';

interface MenuManagementClientProps {
  id: string;
}

export default function MenuManagementClient({ id }: MenuManagementClientProps) {
  const router = useRouter();
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Form states
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    imageUrl: '',
    isAvailable: true
  });

  const categories = ["Entrées", "Plats", "Desserts", "Boissons", "Accompagnements", "Snacks"];

  useEffect(() => {
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
        setRestaurant(res);

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

  const handleOpenModal = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name,
        description: item.description || '',
        price: item.price.toString(),
        category: item.category,
        imageUrl: item.imageUrl || '',
        isAvailable: item.isAvailable
      });
    } else {
      setEditingItem(null);
      setForm({
        name: '',
        description: '',
        price: '',
        category: categories[0],
        imageUrl: '',
        isAvailable: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.category) {
      showError(ERROR_MESSAGES.REQUIRED_FIELDS);
      return;
    }

    setIsSaving(true);
    try {
      const itemData: Partial<MenuItem> = {
        ...form,
        description: form.description || undefined,
        price: parseFloat(form.price),
        restaurantId: id,
        id: editingItem?.id
      };

      await FoodDeliveryService.upsertMenuItem(id, itemData);
      showSuccess(editingItem ? "Article modifié" : "Article ajouté");

      // Refresh menu
      const items = await FoodDeliveryService.getRestaurantMenuFull(id);
      setMenuItems(items);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving item:", error);
      showError("Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      await FoodDeliveryService.upsertMenuItem(id, { ...item, isAvailable: !item.isAvailable });
      setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i));
    } catch (error) {
      showError("Erreur de mise à jour");
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm("Supprimer cet article ?")) return;
    try {
      await FoodDeliveryService.deleteMenuItem(id, itemId);
      setMenuItems(prev => prev.filter(i => i.id !== itemId));
      showSuccess("Article supprimé");
    } catch (error) {
      showError("Erreur de suppression");
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner />
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <header className="bg-background/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(`/food/portal/${id}`)} className="p-2 hover:bg-white/10 rounded-full transition">
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
            <MaterialIcon name="search" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher un plat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 glass-input rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {categories.slice(0, 3).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(prev => prev === cat ? null : cat)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-primary text-white'
                    : 'glass-card border border-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Categories & Items Grid */}
        {categories.map(category => {
          if (selectedCategory && selectedCategory !== category) return null;
          const categoryItems = menuItems.filter(i =>
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
                {categoryItems.map(item => (
                  <div key={item.id} className={`glass-card p-4 rounded-3xl border border-white/5 flex gap-4 group hover:border-white/10 transition ${!item.isAvailable ? 'opacity-60' : ''}`}>
                    <div className="w-24 h-24 bg-white/10 rounded-2xl overflow-hidden relative shrink-0">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" width={96} height={96} unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                          <MaterialIcon name="image" size="xl" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-bold text-white group-hover:text-primary transition">{item.name}</h4>
                          <span className="font-bold text-primary">{formatCurrencyWithCode(item.price)}</span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.description}</p>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <button
                          onClick={() => toggleAvailability(item)}
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full transition ${item.isAvailable ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-slate-500'}`}
                        >
                          {item.isAvailable ? 'Disponible' : 'Indisponible'}
                        </button>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleOpenModal(item)} className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition">
                            <MaterialIcon name="edit" size="sm" />
                          </button>
                          <button onClick={() => deleteItem(item.id)} className="p-2 text-slate-500 hover:text-destructive hover:bg-destructive/10 rounded-lg transition">
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
            <p className="text-slate-400 mb-8">Commencez par ajouter votre premier plat pour attirer des clients !</p>
            <button
              onClick={() => handleOpenModal()}
              className="bg-gradient-to-r from-primary to-[#ffae33] text-white px-8 py-3 rounded-2xl font-bold primary-glow hover:opacity-90 transition"
            >
              Ajouter un plat
            </button>
          </div>
        )}
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="glass-card rounded-3xl w-full max-w-lg relative z-10 overflow-hidden border border-white/10">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">{editingItem ? 'Modifier' : 'Ajouter'} un article</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition text-slate-400">
                <MaterialIcon name="close" size="lg" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nom du plat *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
                  placeholder="Ex: Burger Gourmet Cheese"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Prix (XOF) *</label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={e => setForm({...form, price: e.target.value})}
                    className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
                    placeholder="0.00"
                    step="50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Catégorie *</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white appearance-none"
                    required
                  >
                    {categories.map(c => <option key={c} value={c} className="bg-[#1A1A1A]">{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white h-24 resize-none"
                  placeholder="Ingrédients, taille, accompagnement..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">URL de l'image</label>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={e => setForm({...form, imageUrl: e.target.value})}
                  className="w-full glass-input px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-white"
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-bold text-slate-300">Disponible à la vente</span>
                <button
                  type="button"
                  className={`w-12 h-6 rounded-full transition relative ${form.isAvailable ? 'bg-green-500' : 'bg-slate-600'}`}
                  onClick={() => setForm({...form, isAvailable: !form.isAvailable})}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.isAvailable ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 glass-card border border-white/10 text-slate-300 font-bold rounded-2xl hover:bg-white/10 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-4 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow hover:opacity-90 transition disabled:opacity-50"
                >
                  {isSaving ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <BottomNav items={portalNavItems(id)} />
    </div>
  );
}
