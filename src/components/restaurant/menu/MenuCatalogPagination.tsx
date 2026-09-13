import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

interface MenuCatalogPaginationProps {
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function MenuCatalogPagination({ pageIndex, pageSize, totalCount, hasNextPage, hasPreviousPage, isLoading, onPrevious, onNext }: MenuCatalogPaginationProps) {
  const { t } = useTranslation('restaurant');
  const first = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min((pageIndex + 1) * pageSize, totalCount);

  return (
    <nav aria-label={t('paginationLabel')} className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
      <button type="button" onClick={onPrevious} disabled={!hasPreviousPage || isLoading} aria-label={t('previousPage')} className="flex size-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <MaterialIcon name="chevron_left" size="sm" />
      </button>
      <p className="text-center text-xs font-semibold text-slate-400">
        {isLoading ? t('loadingMore') : t('paginationRange', { first: first.toLocaleString(), last: last.toLocaleString(), total: totalCount.toLocaleString() })}
      </p>
      <button type="button" onClick={onNext} disabled={!hasNextPage || isLoading} aria-label={t('nextPage')} className="flex size-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <MaterialIcon name="chevron_right" size="sm" />
      </button>
    </nav>
  );
}
