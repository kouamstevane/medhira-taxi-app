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
  const unavailableCount = Math.max(totalCount - availableCount, 0);

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
        <label className="min-w-0">
          <span className="sr-only">{t('categoryField')}</span>
          <select
            value={category ?? ''}
            onChange={(event) => onCategoryChange(event.target.value || null)}
            className="glass-input min-h-10 w-full rounded-lg px-2.5 text-xs font-semibold text-slate-200 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">{t('allCategoriesShort')}</option>
            {categories.map((itemCategory) => <option key={itemCategory} value={itemCategory}>{itemCategory}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">{t('sortByField')}</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as MenuCatalogSort)}
            className="glass-input min-h-10 w-full rounded-lg px-2.5 text-xs font-semibold text-slate-200 outline-none focus:ring-2 focus:ring-primary/30"
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
