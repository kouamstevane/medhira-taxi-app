import type { MenuItem } from '@/types';

interface DeleteMenuItemDialogProps {
  item: Pick<MenuItem, 'name'>;
  onCancel: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export function DeleteMenuItemDialog({
  item,
  onCancel,
  onConfirm,
  isProcessing = false,
}: DeleteMenuItemDialogProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-menu-item-dialog-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171a20] p-5 shadow-2xl"
      >
        <h2 id="delete-menu-item-dialog-title" className="text-lg font-bold text-white">
          Supprimer un plat ?
        </h2>
        <p className="mt-2 text-sm leading-5 text-slate-300">
          Voulez-vous vraiment supprimer « {item.name} » ? Cette action est irréversible.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="h-11 flex-1 rounded-xl border border-destructive/30 bg-destructive/15 px-3 text-sm font-bold text-destructive transition hover:bg-destructive/25 disabled:cursor-wait disabled:opacity-60"
          >
            {isProcessing ? 'Suppression en cours…' : 'Confirmer la suppression'}
          </button>
        </div>
      </div>
    </div>
  );
}
