import type { MenuItem } from '@/types';
import { MenuCatalogRow } from './MenuCatalogRow';

interface MenuCatalogTableProps {
  items: MenuItem[];
  selectedIds: string[];
  onSelect: (itemId: string) => void;
  onSelectAll: () => void;
  onToggleAvailability: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (itemId: string) => void;
}

export function MenuCatalogTable({ items, selectedIds, onSelect, onSelectAll, onToggleAvailability, onEdit, onDelete }: MenuCatalogTableProps) {
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  return (
    <section aria-label="Catalogue des plats" className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <div className="hidden grid-cols-[auto_minmax(0,1fr)_160px_120px_140px_auto] items-center gap-4 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 md:grid">
        <input type="checkbox" checked={allSelected} onChange={onSelectAll} aria-label="Sélectionner les plats de la page" className="size-4 accent-primary" />
        <span>Plat</span><span>Catégorie</span><span>Prix</span><span>Disponibilité</span><span>Actions</span>
      </div>
      {items.map((item) => (
        <MenuCatalogRow
          key={item.id}
          item={item}
          selected={selectedIds.includes(item.id)}
          onSelect={onSelect}
          onToggleAvailability={onToggleAvailability}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </section>
  );
}
