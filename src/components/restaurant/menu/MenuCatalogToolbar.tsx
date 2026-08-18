'use client';

import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { MenuCatalogAvailability, MenuCatalogSort } from '@/utils/menu-catalog';

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

function formatCount(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString('fr-FR')} ${value === 1 ? singular : plural}`;
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
  const hasFilters = Boolean(search || category || availability !== 'all' || sort !== 'category');

  return (
    <section aria-label="Recherche et filtres du menu" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-sm font-semibold text-white">
            {formatCount(totalCount, 'plat', 'plats')}
          </p>
          <p className="truncate text-xs text-slate-500">
            {formatCount(availableCount, 'disponible', 'disponibles')}
          </p>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="min-h-11 rounded-xl px-3 text-xs font-bold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <label className="relative block">
        <span className="sr-only">Rechercher un plat</span>
        <MaterialIcon name="search" size="md" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          inputMode="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Rechercher un plat, une catégorie ou une référence..."
          className="glass-input min-h-12 w-full rounded-2xl pl-12 pr-14 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary/30"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MaterialIcon name="close" size="lg" />
          </button>
        )}
      </label>

      <div className="flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-hide" role="group" aria-label="Disponibilité">
        {([
          ['all', 'Tous'],
          ['available', 'Disponibles'],
          ['unavailable', 'Indisponibles'],
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
          <span className="sr-only">Catégorie</span>
          <select
            value={category ?? ''}
            onChange={(event) => onCategoryChange(event.target.value || null)}
            className="glass-input min-h-11 w-full rounded-xl px-3 text-xs font-semibold text-slate-200 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Toutes les catégories</option>
            {categories.map((itemCategory) => <option key={itemCategory} value={itemCategory}>{itemCategory}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Trier par</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as MenuCatalogSort)}
            className="glass-input min-h-11 w-full rounded-xl px-3 text-xs font-semibold text-slate-200 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="category">Catégorie</option>
            <option value="name">Nom A–Z</option>
            <option value="price-asc">Prix croissant</option>
            <option value="price-desc">Prix décroissant</option>
          </select>
        </label>
      </div>
    </section>
  );
}
