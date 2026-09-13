import type { FoodOrder } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

interface OrderRejectionDialogProps {
  order: Pick<FoodOrder, 'id' | 'customerName'>;
  onCancel: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export function OrderRejectionDialog({
  order,
  onCancel,
  onConfirm,
  isProcessing = false,
}: OrderRejectionDialogProps) {
  const { t } = useTranslation('restaurant');
  const orderReference = order.id.slice(-5).toUpperCase();
  const customer = order.customerName ? ` de ${order.customerName}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-rejection-dialog-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171a20] p-5 shadow-2xl"
      >
        <h2 id="order-rejection-dialog-title" className="text-lg font-bold text-white">
          {t('confirmRejectionTitle')}
        </h2>
        <p className="mt-2 text-sm leading-5 text-slate-300">
          {t('confirmRejectionPrompt', { orderId: orderReference, customer })}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="h-10 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="h-10 flex-1 rounded-lg border border-destructive/30 bg-destructive/15 px-3 text-sm font-bold text-destructive transition hover:bg-destructive/25 disabled:cursor-wait disabled:opacity-60"
          >
            {isProcessing ? t('rejectingInProgress') : t('confirmRejectionBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
