import type { MenuItem } from '@/types';
import { MenuCatalogRow } from './MenuCatalogRow';
import { useTranslation } from '@/hooks/useTranslation';

interface MenuCatalogTableProps {
  items: MenuItem[];
  totalCount: number;
  selectedIds: string[];
  onSelect: (itemId: string) => void;
  onSelectAll: () => void | Promise<void>;
  isSelectingAll?: boolean;
  onToggleAvailability: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (itemId: string) => void;
}

export function MenuCatalogTable({ items, totalCount, selectedIds, onSelect, onSelectAll, isSelectingAll = false, onToggleAvailability, onEdit, onDelete }: MenuCatalogTableProps) {
  const { t } = useTranslation('restaurant');
  const allSelected = totalCount > 0 && selectedIds.length === totalCount;
  const someSelected = selectedIds.length > 0;

  return (
    <section aria-label={t('catalogTableLabel')} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <div className="hidden grid-cols-[auto_minmax(0,1fr)_160px_120px_140px_auto] items-center gap-4 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 md:grid">
        <input type="checkbox" checked={allSelected} onChange={() => void onSelectAll()} disabled={isSelectingAll} aria-label={t('selectAllDishes')} aria-checked={someSelected && !allSelected ? 'mixed' : allSelected} className="size-4 accent-primary disabled:opacity-50" />
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
