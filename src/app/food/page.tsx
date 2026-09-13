'use client';

import React, { useEffect, useState } from 'react';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { Restaurant, RestaurantFilters } from '@/types/food-delivery';
import { RestaurantCard } from '@/components/food/RestaurantCard';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
import { NetworkErrorView } from '@/components/ui';
import { isFirestoreNetworkError } from '@/utils/firestore-error-handler';
import { useTranslation } from '@/hooks/useTranslation';
import Link from 'next/link';

export default function FoodHomePage() {
  const { t } = useTranslation();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState<RestaurantFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const CUISINES = [
    { id: 'Tous', labelKey: 'food.cuisines.all' as const },
    { id: 'Africain', labelKey: 'food.cuisines.african' as const },
    { id: 'Européen', labelKey: 'food.cuisines.european' as const },
    { id: 'Fast Food', labelKey: 'food.cuisines.fastFood' as const },
    { id: 'Healthy', labelKey: 'food.cuisines.healthy' as const },
    { id: 'Asiatique', labelKey: 'food.cuisines.asian' as const },
    { id: 'Pâtisserie', labelKey: 'food.cuisines.bakery' as const },
  ];

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setFilters(prev => {
      const next = { ...prev };
      if (value.trim()) {
        next.searchQuery = value.trim();
      } else {
        delete next.searchQuery;
      }
      return next;
    });
  };

  useEffect(() => {
    let isMounted = true;

    const fetchRestaurants = async () => {
      setIsNetworkError(false);
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
          setHasMore(newRestaurants.length === 20);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Erreur chargement restaurants:', error);
          if (
            isFirestoreNetworkError(error) ||
            (error as Error)?.message?.toLowerCase().includes('offline') ||
            (typeof navigator !== 'undefined' && !navigator.onLine)
          ) {
            setIsNetworkError(true);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRestaurants();

    return () => {
      isMounted = false;
    };
  }, [filters.cuisineType, filters.searchQuery, refreshKey]);

  const loadMoreRestaurants = async () => {
    setIsNetworkError(false);
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
      if (
        isFirestoreNetworkError(error) ||
        (error as Error)?.message?.toLowerCase().includes('offline') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        setIsNetworkError(true);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCuisineFilter = (cuisine: string) => {
    setSearchQuery('');
    if (cuisine === 'Tous') {
      const newFilters = { ...filters };
      delete newFilters.cuisineType;
      delete newFilters.searchQuery;
      setFilters(newFilters);
    } else {
      const newFilters = { ...filters, cuisineType: cuisine };
      delete newFilters.searchQuery;
      setFilters(newFilters);
    }
  };

  const recharger = () => {
    setIsNetworkError(false);
    setLoading(true);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background pb-28 max-w-[430px] mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden p-6 rounded-b-[2rem] border-b border-white/[0.06]">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-primary/25 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -left-16 w-56 h-56 bg-primary/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative flex flex-wrap items-start justify-between gap-3 mb-6 pt-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{t('food.title')}</h1>
            <p className="text-slate-400 mt-1">{t('food.subtitle')}</p>
          </div>
          <Link
            href="/food/orders"
            aria-label={t('food.orderStatus')}
            className="inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary shadow-[0_0_18px_rgba(242,146,0,0.12)] transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MaterialIcon name="delivery_dining" size="md" className="text-primary" />
            <span>{t('food.orderStatus')}</span>
            <MaterialIcon name="chevron_right" size="sm" className="text-primary/70" />
          </Link>
        </div>

        {/* Search Bar */}
        <div className="relative mt-2">
          <MaterialIcon name="search" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('food.searchRestaurantOrDish')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full glass-input rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-primary border-0"
          />

        </div>
      </div>

      {/* Categories */}
      <div className="px-4 mt-6">
        <div className="flex gap-2.5 overflow-x-auto pb-4 scrollbar-hide snap-x">
          {CUISINES.map((cuisine) => {
            const isSelected = filters.cuisineType === cuisine.id || (!filters.cuisineType && cuisine.id === 'Tous');
            return (
              <button
                key={cuisine.id}
                onClick={() => handleCuisineFilter(cuisine.id)}
                className={`snap-start flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  isSelected
                    ? 'bg-primary text-white scale-105'
                    : 'glass-card text-slate-300 border border-white/5 hover:bg-white/5'
                }`}
              >
                {t(cuisine.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Restaurant List */}
      <div className="px-4 mt-2">
        <div className="flex justify-between items-end mb-5">
          <h2 className="text-xl font-bold text-white tracking-tight">{t('food.popularNearYou')}</h2>
          <button className="flex items-center gap-1.5 text-sm text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-lg">
            <MaterialIcon name="filter_list" size="sm" /> {t('common.filter')}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center py-32 space-y-4">
            <MaterialIcon name="progress_activity" size="xl" className="animate-spin text-primary" />
            <p className="text-slate-400 font-medium">{t('food.searchingBestRestaurants')}</p>
          </div>
        ) : isNetworkError && restaurants.length === 0 ? (
          <div className="py-8">
            <NetworkErrorView
              message={t('food.networkError')}
              onRetry={recharger}
            />
          </div>
        ) : restaurants.length === 0 ? (
          <div className="glass-card rounded-3xl p-10 text-center border border-white/5 mt-4">
            <div className="flex justify-center mb-6">
              <div className="bg-white/5 p-5 rounded-full">
                <MaterialIcon name="restaurant" size="xl" className="text-slate-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('food.noRestaurantsFound')}</h3>
            <p className="text-slate-400 text-sm">{t('food.tryChangingFilters')}</p>
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
                  className="bg-primary/10 text-primary font-bold py-3 px-8 rounded-full hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-2 min-h-[44px]"
                >
                  {loadingMore ? <MaterialIcon name="progress_activity" size="md" className="animate-spin" /> : t('food.loadMore')}
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
