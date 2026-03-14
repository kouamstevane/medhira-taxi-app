"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  FiPlus, FiEdit2, FiTrash2, FiSearch, FiFilter, 
  FiChevronLeft, FiImage, FiCheck, FiX, FiMoreVertical,
  FiTrendingUp, FiAlertCircle, FiList
} from 'react-icons/fi';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import type { Restaurant, MenuItem } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';

export function generateStaticParams() {
  return [];
}

export default function MenuManagementPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      showError("Veuillez remplir tous les champs obligatoires");
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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(`/food/portal/${id}`)} className="p-2 hover:bg-gray-100 rounded-full transition">
            <FiChevronLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#101010]">Gestion du Menu</h1>
            <p className="text-xs text-gray-500">{menuItems.length} articles au total</p>
          </div>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-100 hover:bg-red-700 transition transform hover:scale-105"
        >
          <FiPlus /> Nouveau
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-8">
        
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Rechercher un plat..." 
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-red-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
             {categories.slice(0, 3).map(cat => (
               <button key={cat} className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-sm font-medium hover:bg-gray-50">
                 {cat}
               </button>
             ))}
          </div>
        </div>

        {/* Categories & Items Grid */}
        {categories.map(category => {
          const categoryItems = menuItems.filter(i => i.category === category);
          if (categoryItems.length === 0) return null;

          return (
            <section key={category} className="mb-10">
              <h3 className="text-lg font-bold text-[#101010] mb-5 flex items-center gap-3">
                <span className="w-1 h-6 bg-red-600 rounded-full"></span>
                {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryItems.map(item => (
                  <div key={item.id} className={`bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex gap-4 group hover:shadow-md transition ${!item.isAvailable ? 'opacity-60 grayscale' : ''}`}>
                    <div className="w-24 h-24 bg-gray-100 rounded-2xl overflow-hidden relative shrink-0">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <FiImage size={32} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-bold text-[#101010] group-hover:text-red-600 transition">{item.name}</h4>
                          <span className="font-bold text-red-600">{formatCurrencyWithCode(item.price)}</span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.description}</p>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <button 
                          onClick={() => toggleAvailability(item)}
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${item.isAvailable ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                        >
                          {item.isAvailable ? 'Disponible' : 'Indisponible'}
                        </button>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleOpenModal(item)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                            <FiEdit2 size={16} />
                          </button>
                          <button onClick={() => deleteItem(item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                            <FiTrash2 size={16} />
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
          <div className="py-20 text-center text-gray-400">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <FiList className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Votre menu est vide</h3>
            <p className="mb-8">Commencez par ajouter votre premier plat pour attirer des clients !</p>
            <button 
              onClick={() => handleOpenModal()}
              className="bg-[#101010] text-white px-8 py-3 rounded-2xl font-bold hover:bg-red-600 transition"
            >
              Ajouter un plat
            </button>
          </div>
        )}
      </main>

      {/* Custom Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl relative z-10 overflow-hidden animate-fadeIn">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-xl font-bold text-[#101010]">{editingItem ? 'Modifier' : 'Ajouter'} un article</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                <FiX className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nom du plat *</label>
                <input 
                  type="text" 
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-500 outline-none transition"
                  placeholder="Ex: Burger Gourmet Cheese"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Prix (XOF) *</label>
                  <input 
                    type="number" 
                    value={form.price}
                    onChange={e => setForm({...form, price: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-500 outline-none transition"
                    placeholder="0.00"
                    step="50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Catégorie *</label>
                  <select 
                    value={form.category}
                    onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-500 outline-none transition appearance-none"
                    required
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Description</label>
                <textarea 
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-500 outline-none transition h-24 resize-none"
                  placeholder="Ingrédients, taille, accompagnement..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">URL de l'image</label>
                <input 
                  type="url" 
                  value={form.imageUrl}
                  onChange={e => setForm({...form, imageUrl: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-500 outline-none transition"
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-bold text-gray-700">Disponible à la vente</span>
                <button 
                  type="button"
                  className={`w-12 h-6 rounded-full transition relative ${form.isAvailable ? 'bg-green-500' : 'bg-gray-300'}`}
                  onClick={() => setForm({...form, isAvailable: !form.isAvailable})}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.isAvailable ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-4 bg-[#101010] text-white font-bold rounded-2xl hover:bg-red-600 transition disabled:opacity-50"
                >
                  {isSaving ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
