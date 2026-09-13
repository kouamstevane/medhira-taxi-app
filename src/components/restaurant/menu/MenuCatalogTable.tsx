import type { MenuItem } from '@/types';
import { MenuCatalogRow } from './MenuCatalogRow';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t } = useTranslation('restaurant');
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  return (
    <section aria-label={t('catalogTableLabel')} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <div className="hidden grid-cols-[auto_minmax(0,1fr)_160px_120px_140px_auto] items-center gap-4 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 md:grid">
        <input type="checkbox" checked={allSelected} onChange={onSelectAll} aria-label={t('selectAllDishes')} className="size-4 accent-primary" />
        <span>{t('thDish')}</span><span>{t('thCategory')}</span><span>{t('thPrice')}</span><span>{t('thAvailability')}</span><span>{t('thActions')}</span>
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
