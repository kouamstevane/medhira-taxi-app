'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { CustomerRestaurantMenuCategory } from '@/services/food-delivery.service';
import { cn } from '@/lib/utils';

interface RestaurantMenuNavigationProps {
  search: string;
  category: string | null;
  categories: CustomerRestaurantMenuCategory[];
  onSearchChange: (value: string) => void;
  onCategoryChange: (category: string | null) => void;
  onClearFilters: () => void;
}

export function RestaurantMenuNavigation({
  search,
  category,
  categories,
  onSearchChange,
  onCategoryChange,
  onClearFilters,
}: RestaurantMenuNavigationProps) {
  const hasActiveFilters = Boolean(search.trim()) || Boolean(category);
  const isAllActive = category === null;

  return (
    <section
      aria-label="Navigation du menu"
      className="sticky top-0 z-30 -mx-4 overflow-x-clip border-b border-white/10 bg-[#091018]/90 px-4 py-4 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#091018]/80"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#F2C87D]">
              Menu du restaurant
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Rechercher un plat
            </h2>
          </div>

          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-slate-200 hover:bg-white/[0.06] hover:text-white"
              onClick={onClearFilters}
            >
              <MaterialIcon name="refresh" size="sm" className="mr-1.5" />
              Réinitialiser
            </Button>
          ) : null}
        </div>

        <div className="relative">
          <MaterialIcon
            name="search"
            size="sm"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <label htmlFor="restaurant-menu-search" className="sr-only">
            Rechercher un plat
          </label>
          <Input
            id="restaurant-menu-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Rechercher un plat…"
            className="h-11 rounded-full border-white/10 bg-white/[0.04] pl-11 pr-4 text-[15px] text-white placeholder:text-slate-500 focus-visible:border-[#F2C87D]/50 focus-visible:ring-[#F2C87D]/20"
          />
        </div>

        <div
          className="flex max-w-full gap-2 overflow-x-auto pb-1 pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Catégories"
        >
          <Button
            type="button"
            variant={isAllActive ? 'secondary' : 'ghost'}
            aria-pressed={isAllActive}
            className={cn(
              'min-h-11 rounded-full px-4 text-sm',
              isAllActive
                ? 'bg-[#F2C87D] text-[#0E1320] hover:bg-[#F2C87D] hover:text-[#0E1320]'
                : 'border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06] hover:text-white',
            )}
            onClick={() => onCategoryChange(null)}
          >
            Tout
          </Button>

          {categories.map((item) => {
            const active = category === item.name;

            return (
              <Button
                key={item.name}
                type="button"
                variant={active ? 'secondary' : 'ghost'}
                aria-pressed={active}
                className={cn(
                  'min-h-11 rounded-full px-4 text-sm',
                  active
                    ? 'bg-white text-[#0E1320] hover:bg-white hover:text-[#0E1320]'
                    : 'border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06] hover:text-white',
                )}
                onClick={() => onCategoryChange(item.name)}
              >
                <span>{item.name}</span>
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs tabular-nums text-inherit">
                  {item.availableCount}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
