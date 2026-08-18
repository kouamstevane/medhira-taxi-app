'use client';

import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { MenuItemImage } from '@/components/food/MenuItemImage';
import type { MenuItem } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';

interface MenuCatalogRowProps {
  item: MenuItem;
  selected: boolean;
  onSelect: (itemId: string) => void;
  onToggleAvailability: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (itemId: string) => void;
}

export function MenuCatalogRow({ item, selected, onSelect, onToggleAvailability, onEdit, onDelete }: MenuCatalogRowProps) {
  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.06] px-3 py-3 transition md:grid-cols-[auto_minmax(0,1fr)_160px_120px_140px_auto] md:gap-4 md:px-4 ${selected ? 'bg-primary/[0.06]' : 'hover:bg-white/[0.025]'} ${!item.isAvailable ? 'opacity-65' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelect(item.id)}
        aria-label={`Sélectionner ${item.name}`}
        className="size-4 accent-primary"
      />
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
          <MenuItemImage src={item.imageUrl} imageStoragePath={item.imageStoragePath} alt="" sizes="48px" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{item.name}</p>
          <p className="truncate text-xs text-slate-500">{item.category}</p>
          <p className="mt-1 truncate text-xs text-slate-500 md:hidden">{formatCurrencyWithCode(item.price)}</p>
        </div>
      </div>
      <p className="hidden truncate text-sm text-slate-400 md:block">{item.category}</p>
      <p className="hidden text-sm font-bold text-primary md:block">{formatCurrencyWithCode(item.price)}</p>
      <button
        type="button"
        onClick={() => onToggleAvailability(item)}
        aria-pressed={item.isAvailable}
        aria-label={`${item.isAvailable ? 'Rendre indisponible' : 'Rendre disponible'} ${item.name}`}
        className={`hidden min-h-11 rounded-xl px-3 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:block ${item.isAvailable ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' : 'bg-white/[0.06] text-slate-400 hover:bg-white/[0.1]'}`}
      >
        {item.isAvailable ? 'Disponible' : 'Indisponible'}
      </button>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onToggleAvailability(item)} aria-label={`${item.isAvailable ? 'Rendre indisponible' : 'Rendre disponible'} ${item.name}`} className="flex size-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white/[0.07] hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden">
          <MaterialIcon name={item.isAvailable ? 'visibility' : 'visibility_off'} size="sm" />
        </button>
        <button type="button" onClick={() => onEdit(item)} aria-label={`Modifier ${item.name}`} className="flex size-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-blue-500/10 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <MaterialIcon name="edit" size="sm" />
        </button>
        <button type="button" onClick={() => onDelete(item.id)} aria-label={`Supprimer ${item.name}`} className="flex size-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <MaterialIcon name="delete" size="sm" />
        </button>
      </div>
    </div>
  );
}
