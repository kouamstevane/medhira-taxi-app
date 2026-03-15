'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { Restaurant, MenuItem } from '@/types/food-delivery';
import { MenuItemCard } from '@/components/food/MenuItemCard';
import { CartDrawer } from '@/components/food/CartDrawer';
import { ArrowLeft, Star, Clock, MapPin, Loader2, Info } from 'lucide-react';
import { CURRENCY_CODE } from '@/utils/constants';

interface RestaurantClientProps {
  id: string;
}

export default function RestaurantClient({ id }: RestaurantClientProps) {
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadRestaurantData();
    }
  }, [id]);

  const loadRestaurantData = async () => {
    try {
      // Pour ce walkthrough on récupère tous les restaurants et on filtre, 
      // dans une app prod on ajouterait `getRestaurantById` dans le service
      const { restaurants } = await FoodDeliveryService.getApprovedRestaurants({});
      const current = restaurants.find(r => r.id === id);
      
      if (current) {
        setRestaurant(current);
        const menu = await FoodDeliveryService.getRestaurantMenu(id);
        setMenuItems(menu);
      }
    } catch (error) {
      console.error('Erreur chargement détails:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen text-center py-20 bg-gray-50">
        <h2 className="text-xl font-bold">Restaurant introuvable</h2>
        <button onClick={() => router.back()} className="mt-4 text-primary font-medium">Retour</button>
      </div>
    );
  }

  // Grouper les items par catégorie
  const groupedMenu = menuItems.reduce((acc, item) => {
    const category = item.category || 'Populaires';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Cover Image & Back button */}
      <div className="relative h-64 w-full bg-gray-200">
        {restaurant.imageUrl && (
          <Image
            src={restaurant.imageUrl}
            alt={restaurant.name}
            fill
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        <button 
          onClick={() => router.back()}
          className="absolute top-6 left-4 bg-white/20 backdrop-blur-md p-2 rounded-full text-white hover:bg-white/30 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      {/* Restaurant Info Header */}
      <div className="relative -mt-16 px-4 z-10">
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex justify-between items-start">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2">{restaurant.name}</h1>
            {restaurant.rating > 0 && (
              <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2.5 py-1 rounded-lg font-bold">
                <Star className="w-4 h-4 fill-current" />
                <span>{restaurant.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
          
          <p className="text-gray-500 font-medium mb-4">{restaurant.cuisineType} • {restaurant.avgPricePerPerson} {CURRENCY_CODE} / pers.</p>
          
          <div className="flex items-center gap-6 text-sm text-gray-600 font-medium">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <span>15-25 min</span>
            </div>
            {restaurant.address && (
              <div className="flex items-center gap-2 max-w-[60%]">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">{restaurant.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Menu List */}
      <div className="px-4 mt-8">
        {!restaurant.isOpen && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 mb-6 flex items-start gap-3">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Ce restaurant est actuellement fermé.</p>
              <p className="text-sm mt-1 opacity-90">Vous ne pouvez pas passer de commande pour le moment.</p>
            </div>
          </div>
        )}

        {Object.entries(groupedMenu).map(([category, items]) => (
          <div key={category} className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight capitalize">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => (
                <MenuItemCard key={item.id} item={item} restaurant={restaurant} />
              ))}
            </div>
          </div>
        ))}
        
        {menuItems.length === 0 && (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
            <p className="text-gray-500 font-medium">Ce restaurant n'a pas encore ajouté de plats à son menu.</p>
          </div>
        )}
      </div>

      {restaurant.isOpen && <CartDrawer />}
    </div>
  );
}
