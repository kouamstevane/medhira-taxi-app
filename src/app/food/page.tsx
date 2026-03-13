'use client';

import React, { useEffect, useState } from 'react';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { Restaurant, RestaurantFilters } from '@/types/food-delivery';
import { RestaurantCard } from '@/components/food/RestaurantCard';
import { Search, Filter, Loader2, ChefHat, Bike } from 'lucide-react';
import Link from 'next/link';

export default function FoodHomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState<RestaurantFilters>({});

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
    if (cuisine === 'Tous') {
      const newFilters = { ...filters };
      delete newFilters.cuisineType;
      setFilters(newFilters);
    } else {
      setFilters({ ...filters, cuisineType: cuisine });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-6 rounded-b-[2rem] shadow-sm">
        <div className="flex justify-between items-center mb-6 pt-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Food Delivery</h1>
            <p className="text-primary-foreground/80 mt-1">Qu'est-ce qui vous ferait plaisir ?</p>
          </div>
          <Link href="/food/orders" className="bg-white/20 p-3 rounded-full hover:bg-white/30 transition-colors">
             <Bike className="w-6 h-6" />
          </Link>
        </div>

        {/* Search Bar */}
        <div className="relative mt-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Rechercher un plat, un restaurant..." 
            className="w-full bg-white text-gray-900 rounded-2xl py-3.5 pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-white border-0"
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
                    ? 'bg-primary text-white shadow-md scale-105' 
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
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
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">À proximité de vous</h2>
          <button className="flex items-center gap-1.5 text-sm text-primary font-bold bg-primary/5 px-3 py-1.5 rounded-lg">
            <Filter className="w-4 h-4" /> Filtres
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center py-32 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-gray-500 font-medium">Recherche des meilleurs restaurants...</p>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-gray-100 shadow-sm mt-4">
            <div className="flex justify-center mb-6">
              <div className="bg-gray-50 p-5 rounded-full">
                <ChefHat className="w-12 h-12 text-gray-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Aucun restaurant trouvé</h3>
            <p className="text-gray-500 text-sm">Essayez de modifier vos filtres ou de tester une autre cuisine.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {restaurants.map((restaurant) => (
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
                  {loadingMore ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Charger plus'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
