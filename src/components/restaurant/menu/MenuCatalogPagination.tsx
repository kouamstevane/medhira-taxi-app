import { MaterialIcon } from '@/components/ui/MaterialIcon';

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
  const first = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min((pageIndex + 1) * pageSize, totalCount);

  return (
    <nav aria-label="Pagination du catalogue" className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
      <button type="button" onClick={onPrevious} disabled={!hasPreviousPage || isLoading} aria-label="Page précédente" className="flex size-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <MaterialIcon name="chevron_left" size="sm" />
      </button>
      <p className="text-center text-xs font-semibold text-slate-400">
        {isLoading ? 'Chargement...' : `${first.toLocaleString('fr-FR')}–${last.toLocaleString('fr-FR')} sur ${totalCount.toLocaleString('fr-FR')}`}
      </p>
      <button type="button" onClick={onNext} disabled={!hasNextPage || isLoading} aria-label="Page suivante" className="flex size-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <MaterialIcon name="chevron_right" size="sm" />
      </button>
    </nav>
  );
}
