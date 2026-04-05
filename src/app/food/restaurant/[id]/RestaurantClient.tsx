'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { Restaurant, MenuItem } from '@/types/food-delivery';
import { MenuItemCard } from '@/components/food/MenuItemCard';
import { CartDrawer } from '@/components/food/CartDrawer';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { CURRENCY_CODE } from '@/utils/constants';
import { BottomNav } from '@/components/ui/BottomNav';

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
      <div className="min-h-screen flex justify-center items-center bg-background">
        <MaterialIcon name="progress_activity" size="xl" className="animate-spin text-primary" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen text-center py-20 bg-background">
        <h2 className="text-xl font-bold text-white">Restaurant introuvable</h2>
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
    <div className="min-h-screen bg-background pb-32 max-w-[430px] mx-auto">
      {/* Cover Image & Back button */}
      <div className="relative h-64 w-full bg-white/5">
        {restaurant.imageUrl && (
          <Image
            src={restaurant.imageUrl}
            alt={restaurant.name}
            fill
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-black/20 to-transparent" />

        <button
          onClick={() => router.back()}
          className="absolute top-6 left-4 bg-white/20 backdrop-blur-md p-2 rounded-full text-white hover:bg-white/30 transition-colors"
        >
          <MaterialIcon name="arrow_back" size="lg" />
        </button>
      </div>

      {/* Restaurant Info Header */}
      <div className="relative -mt-16 px-4 z-10">
        <div className="glass-card rounded-2xl p-6 border border-white/5">
          <div className="flex justify-between items-start">
            <h1 className="text-2xl font-extrabold text-white mb-2">{restaurant.name}</h1>
            {restaurant.rating > 0 && (
              <div className="flex items-center gap-1.5 bg-green-500/10 text-green-400 px-2.5 py-1 rounded-lg font-bold">
                <MaterialIcon name="star" size="sm" filled />
                <span>{restaurant.rating.toFixed(1)}</span>
              </div>
            )}
          </div>

          <p className="text-slate-400 font-medium mb-4">{restaurant.cuisineType} • {restaurant.avgPricePerPerson} {CURRENCY_CODE} / pers.</p>

          <div className="flex items-center gap-6 text-sm text-slate-300 font-medium">
            <div className="flex items-center gap-2">
              <MaterialIcon name="schedule" size="sm" className="text-primary" />
              <span>15-25 min</span>
            </div>
            {restaurant.address && (
              <div className="flex items-center gap-2 max-w-[60%]">
                <MaterialIcon name="location_on" size="sm" className="text-primary shrink-0" />
                <span className="truncate">{restaurant.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Menu List */}
      <div className="px-4 mt-8">
        {!restaurant.isOpen && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 mb-6 flex items-start gap-3">
            <MaterialIcon name="info" size="md" className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Ce restaurant est actuellement fermé.</p>
              <p className="text-sm mt-1 opacity-90">Vous ne pouvez pas passer de commande pour le moment.</p>
            </div>
          </div>
        )}

        {Object.entries(groupedMenu).map(([category, items]) => (
          <div key={category} className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight capitalize">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => (
                <MenuItemCard key={item.id} item={item} restaurant={restaurant} />
              ))}
            </div>
          </div>
        ))}

        {menuItems.length === 0 && (
          <div className="text-center py-10 glass-card rounded-2xl border border-white/5">
            <p className="text-slate-400 font-medium">Ce restaurant n'a pas encore ajouté de plats à son menu.</p>
          </div>
        )}
      </div>

      {restaurant.isOpen && <CartDrawer />}
      <BottomNav />
    </div>
  );
}
