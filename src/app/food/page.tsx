'use client';

import React, { useEffect, useState } from 'react';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { Restaurant, RestaurantFilters } from '@/types/food-delivery';
import { RestaurantCard } from '@/components/food/RestaurantCard';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
import Link from 'next/link';

export default function FoodHomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState<RestaurantFilters>({});
  const [searchQuery, setSearchQuery] = useState('');

  const CUISINES = ['Tous', 'Africain', 'Européen', 'Fast Food', 'Healthy', 'Asiatique', 'Pâtisserie'];

  useEffect(() => {
    let isMounted = true;

    const fetchRestaurants = async () => {
      setLoading(true);
      try {
        const { restaurants: newRestaurants, lastDoc } = await FoodDeliveryService.getApprovedRestaurants(
          filters,
          20,
          null
        );

        if (isMounted) {
          setRestaurants(newRestaurants);
          setLastVisible(lastDoc);
          setHasMore(newRestaurants.length === 20); // medJira spec limits to 20
        }
      } catch (error) {
        if (isMounted) console.error('Erreur chargement restaurants:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRestaurants();

    return () => {
      isMounted = false;
    };
  }, [filters.cuisineType]);

  const loadMoreRestaurants = async () => {
    setLoadingMore(true);

    try {
      const { restaurants: newRestaurants, lastDoc } = await FoodDeliveryService.getApprovedRestaurants(
        filters,
        20,
        lastVisible
      );

      setRestaurants(prev => [...prev, ...newRestaurants]);
      setLastVisible(lastDoc);
      setHasMore(newRestaurants.length === 20);
    } catch (error) {
      console.error('Erreur chargement plus de restaurants:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCuisineFilter = (cuisine: string) => {
    setSearchQuery('');
    if (cuisine === 'Tous') {
      const newFilters = { ...filters };
      delete newFilters.cuisineType;
      setFilters(newFilters);
    } else {
      setFilters({ ...filters, cuisineType: cuisine });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28 max-w-[430px] mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden p-6 rounded-b-[2rem] border-b border-white/[0.06]">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-primary/25 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -left-16 w-56 h-56 bg-primary/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative flex justify-between items-center mb-6 pt-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Food Delivery</h1>
            <p className="text-slate-400 mt-1">Qu'est-ce qui vous ferait plaisir ?</p>
          </div>
          <Link href="/food/orders" className="glass-card border border-white/10 p-3 rounded-full hover:bg-white/5 transition-colors">
             <MaterialIcon name="delivery_dining" size="lg" className="text-primary" />
          </Link>
        </div>

        {/* Search Bar */}
        <div className="relative mt-2">
          <MaterialIcon name="search" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher un plat, un restaurant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full glass-input rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-primary border-0"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 mt-6">
        <div className="flex gap-2.5 overflow-x-auto pb-4 scrollbar-hide snap-x">
          {CUISINES.map((cuisine) => {
            const isSelected = filters.cuisineType === cuisine || (!filters.cuisineType && cuisine === 'Tous');
            return (
              <button
                key={cuisine}
                onClick={() => handleCuisineFilter(cuisine)}
                className={`snap-start flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  isSelected
                    ? 'bg-primary text-white scale-105'
                    : 'glass-card text-slate-300 border border-white/5 hover:bg-white/5'
                }`}
              >
                {cuisine}
              </button>
            );
          })}
        </div>
      </div>

      {/* Restaurant List */}
      <div className="px-4 mt-2">
        <div className="flex justify-between items-end mb-5">
          <h2 className="text-xl font-bold text-white tracking-tight">À proximité de vous</h2>
          <button className="flex items-center gap-1.5 text-sm text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-lg">
            <MaterialIcon name="filter_list" size="sm" /> Filtres
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center py-32 space-y-4">
            <MaterialIcon name="progress_activity" size="xl" className="animate-spin text-primary" />
            <p className="text-slate-400 font-medium">Recherche des meilleurs restaurants...</p>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="glass-card rounded-3xl p-10 text-center border border-white/5 mt-4">
            <div className="flex justify-center mb-6">
              <div className="bg-white/5 p-5 rounded-full">
                <MaterialIcon name="restaurant" size="xl" className="text-slate-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Aucun restaurant trouvé</h3>
            <p className="text-slate-400 text-sm">Essayez de modifier vos filtres ou de tester une autre cuisine.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {restaurants.filter(r =>
                !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((restaurant) => (
                <RestaurantCard key={restaurant.id} restaurant={restaurant} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={loadMoreRestaurants}
                  disabled={loadingMore}
                  className="bg-primary/10 text-primary font-bold py-3 px-8 rounded-full hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loadingMore ? <MaterialIcon name="progress_activity" size="md" className="animate-spin" /> : 'Charger plus'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
