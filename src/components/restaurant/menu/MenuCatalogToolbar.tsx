'use client';

import { MaterialIcon } from '@/components/ui/MaterialIcon';
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
  onClearFilters: () => void;
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
  onClearFilters,
}: MenuCatalogToolbarProps) {
  const { t } = useTranslation('restaurant');
  const hasFilters = Boolean(search || category || availability !== 'all' || sort !== 'category');

  return (
    <section aria-label={t('searchAndFiltersLabel')} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-sm font-semibold text-white">
            {t('dishesCount', {
              count: totalCount.toLocaleString(),
              dishes: totalCount === 1 ? t('dishSingular') : t('dishPlural'),
            })}
          </p>
          <p className="truncate text-xs text-slate-500">
            {t('availableCount', {
              count: availableCount.toLocaleString(),
              available: availableCount === 1 ? t('availableSingular') : t('availablePlural'),
            })}
          </p>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="min-h-11 rounded-xl px-3 text-xs font-bold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('reset')}
          </button>
        )}
      </div>

      <label className="relative block">
        <span className="sr-only">{t('searchDishPlaceholder')}</span>
        <MaterialIcon name="search" size="md" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          inputMode="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('searchDishPlaceholder')}
          className="glass-input min-h-12 w-full rounded-2xl pl-12 pr-14 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary/30"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label={t('clearSearch')}
            className="absolute right-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MaterialIcon name="close" size="lg" />
          </button>
        )}
      </label>

      <div className="flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-hide" role="group" aria-label={t('availabilityFilter')}>
        {([
          ['all', t('allFilter')],
          ['available', t('availableFilter')],
          ['unavailable', t('unavailableFilter')],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onAvailabilityChange(value)}
            aria-pressed={availability === value}
            className={`min-h-11 shrink-0 rounded-xl px-4 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${availability === value ? 'bg-primary text-white' : 'border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className="sr-only">{t('categoryField')}</span>
          <select
            value={category ?? ''}
            onChange={(event) => onCategoryChange(event.target.value || null)}
            className="glass-input min-h-11 w-full rounded-xl px-3 text-xs font-semibold text-slate-200 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">{t('allCategories')}</option>
            {categories.map((itemCategory) => <option key={itemCategory} value={itemCategory}>{itemCategory}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">{t('sortByField')}</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as MenuCatalogSort)}
            className="glass-input min-h-11 w-full rounded-xl px-3 text-xs font-semibold text-slate-200 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="category">{t('sortCategory')}</option>
            <option value="name">{t('sortName')}</option>
            <option value="price-asc">{t('sortPriceAsc')}</option>
            <option value="price-desc">{t('sortPriceDesc')}</option>
          </select>
        </label>
      </div>
    </section>
  );
}
