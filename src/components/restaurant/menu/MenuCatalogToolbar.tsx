'use client';

import { useState } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { MenuCatalogAvailability, MenuCatalogSort } from '@/utils/menu-catalog';
import { useTranslation } from '@/hooks/useTranslation';

interface MenuCatalogToolbarProps {
  search: string;
  category: string | null;
  categories: string[];
  availability: MenuCatalogAvailability;
  sort: MenuCatalogSort;
  totalCount: number;
  availableCount: number;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string | null) => void;
  onAvailabilityChange: (value: MenuCatalogAvailability) => void;
  onSortChange: (value: MenuCatalogSort) => void;
}

export function MenuCatalogToolbar({
  search,
  category,
  categories,
  availability,
  sort,
  totalCount,
  availableCount,
  onSearchChange,
  onCategoryChange,
  onAvailabilityChange,
  onSortChange,
}: MenuCatalogToolbarProps) {
  const { t } = useTranslation('restaurant');
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);

  const unavailableCount = Math.max(totalCount - availableCount, 0);

  const sortLabels: Record<MenuCatalogSort, string> = {
    category: t('sortCategory'),
    name: t('sortName'),
    'price-asc': t('sortPriceAsc'),
    'price-desc': t('sortPriceDesc'),
  };

  return (
    <section aria-label={t('searchAndFiltersLabel')} className="space-y-2.5 md:space-y-3">
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('availabilityFilter')}>
        {([
          ['all', t('allFilter'), totalCount],
          ['available', t('availableFilter'), availableCount],
          ['unavailable', t('unavailableFilter'), unavailableCount],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => onAvailabilityChange(value)}
            aria-pressed={availability === value}
            className={`flex min-h-10 min-w-0 flex-col items-center justify-center rounded-lg px-1.5 text-[11px] font-bold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-row sm:gap-1 sm:px-3.5 sm:text-xs ${availability === value ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07] hover:text-white'}`}
          >
            <span>{label}</span><span className="text-[10px] opacity-80 sm:text-xs">{count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <label className="relative block">
        <span className="sr-only">{t('searchDishPlaceholder')}</span>
        <MaterialIcon name="search" size="md" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          inputMode="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('searchDishPlaceholder')}
          className="glass-input min-h-11 w-full rounded-xl pl-11 pr-12 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary/30"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label={t('clearSearch')}
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MaterialIcon name="close" size="lg" />
          </button>
        )}
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setIsCategorySheetOpen(true)}
          className={`glass-input flex min-h-10 w-full items-center justify-between gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus:ring-2 focus:ring-primary/30 ${
            category ? 'border-primary/40 bg-primary/10 text-white' : 'text-slate-200 hover:text-white'
          }`}
          aria-label={t('categoryField')}
          aria-haspopup="dialog"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <MaterialIcon name="filter_list" size="sm" className="shrink-0 text-slate-400" />
            <span className="truncate">
              <span className="text-slate-400 font-normal">{t('categoryField')} : </span>
              <span className="text-white font-semibold">{category || t('allCategoriesShort')}</span>
            </span>
          </div>
          <MaterialIcon name="expand_more" size="sm" className="shrink-0 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => setIsSortSheetOpen(true)}
          className="glass-input flex min-h-10 w-full items-center justify-between gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-200 transition hover:text-white focus:ring-2 focus:ring-primary/30"
          aria-label={t('sortByField')}
          aria-haspopup="dialog"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <MaterialIcon name="sort" size="sm" className="shrink-0 text-slate-400" />
            <span className="truncate">
              <span className="text-slate-400 font-normal">{t('sortPrefix')}</span>
              <span className="text-white font-semibold">{sortLabels[sort]}</span>
            </span>
          </div>
          <MaterialIcon name="expand_more" size="sm" className="shrink-0 text-slate-400" />
        </button>
      </div>

      <BottomSheet
        open={isCategorySheetOpen}
        onOpenChange={setIsCategorySheetOpen}
        title={t('filterByCategory')}
      >
        <div className="space-y-1.5 py-1 max-h-[55vh] overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onCategoryChange(null);
              setIsCategorySheetOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition min-h-[48px] border ${
              category === null
                ? 'bg-primary/20 border-primary/40 text-white shadow-sm'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span>{t('allCategories')}</span>
            {category === null && (
              <div className="flex size-5 items-center justify-center rounded-full bg-primary text-white">
                <MaterialIcon name="check" size="sm" />
              </div>
            )}
          </button>

          {categories.map((itemCategory) => {
            const isSelected = category === itemCategory;
            return (
              <button
                key={itemCategory}
                type="button"
                onClick={() => {
                  onCategoryChange(itemCategory);
                  setIsCategorySheetOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition min-h-[48px] border ${
                  isSelected
                    ? 'bg-primary/20 border-primary/40 text-white shadow-sm'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="truncate">{itemCategory}</span>
                {isSelected && (
                  <div className="flex size-5 items-center justify-center rounded-full bg-primary text-white">
                    <MaterialIcon name="check" size="sm" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={isSortSheetOpen}
        onOpenChange={setIsSortSheetOpen}
        title={t('sortByField')}
      >
        <div className="space-y-1.5 py-1 max-h-[55vh] overflow-y-auto">
          {([
            ['category', t('sortCategory')],
            ['name', t('sortName')],
            ['price-asc', t('sortPriceAsc')],
            ['price-desc', t('sortPriceDesc')],
          ] as const).map(([sortValue, label]) => {
            const isSelected = sort === sortValue;
            return (
              <button
                key={sortValue}
                type="button"
                onClick={() => {
                  onSortChange(sortValue);
                  setIsSortSheetOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition min-h-[48px] border ${
                  isSelected
                    ? 'bg-primary/20 border-primary/40 text-white shadow-sm'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{label}</span>
                {isSelected && (
                  <div className="flex size-5 items-center justify-center rounded-full bg-primary text-white">
                    <MaterialIcon name="check" size="sm" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </section>
  );
}
