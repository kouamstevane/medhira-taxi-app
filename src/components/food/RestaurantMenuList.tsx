'use client';

import { Button } from '@/components/ui/Button';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { Skeleton } from '@/components/ui/Skeleton';
import { MenuItemCard } from '@/components/food/MenuItemCard';
import type { MenuItem, Restaurant } from '@/types/food-delivery';

interface RestaurantMenuListProps {
  restaurant: Restaurant;
  items: MenuItem[];
  search: string;
  category: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}

function MenuItemSkeleton() {
  return (
    <article
      data-testid="menu-item-skeleton"
      className="rounded-2xl border border-white/5 bg-white/[0.03] p-4"
      aria-hidden="true"
    >
      <div className="flex gap-4">
        <Skeleton className="h-24 w-24 rounded-xl" />
        <div className="flex-1 space-y-3 py-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <div className="flex justify-end">
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </div>
      </div>
    </article>
  );
}

export function RestaurantMenuList({
  restaurant,
  items,
  search,
  category,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  onLoadMore,
  onRetry,
}: RestaurantMenuListProps) {
  const hasFilters = Boolean(search.trim()) || Boolean(category);
  const showEmptyState = !isLoading && !error && items.length === 0;

  return (
    <section aria-label="Plats du menu" className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive"
        >
          <p className="font-medium">{error}</p>
          <Button
            type="button"
            variant="destructive"
            className="mt-3 min-h-11 rounded-full px-4"
            onClick={onRetry}
          >
            Réessayer
          </Button>
        </div>
      ) : null}

      {isLoading && items.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <MenuItemSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <MenuItemCard key={item.id} item={item} restaurant={restaurant} />
          ))}
        </div>
      ) : null}

      {isLoadingMore ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
          <MaterialIcon name="progress_activity" size="sm" className="animate-spin text-[#F2C87D]" />
          <span>Chargement de plats supplémentaires…</span>
        </div>
      ) : null}

      {showEmptyState ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-10 text-center text-slate-300">
          <p className="text-base font-medium text-white">
            {hasFilters
              ? 'Aucun plat ne correspond à votre recherche.'
              : "Ce restaurant n'a pas encore ajouté de plats à son menu."}
          </p>
        </div>
      ) : null}

      {hasMore && !isLoadingMore && !error ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-full border-white/10 bg-white/[0.03] px-5 text-slate-100 hover:bg-white/[0.07]"
            onClick={onLoadMore}
          >
            Afficher plus de plats
          </Button>
        </div>
      ) : null}
    </section>
  );
}
