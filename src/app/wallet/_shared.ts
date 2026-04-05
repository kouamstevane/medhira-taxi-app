export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'payment';
  method?: string;
  amount: number;
  netAmount?: number;
  date: Date;
  status?: string;
}

export const TRANSACTION_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  deposit:    { icon: 'add_card',      color: 'text-green-400', bg: 'bg-green-400/10' },
  withdrawal: { icon: 'arrow_outward', color: 'text-red-400',   bg: 'bg-red-400/10' },
  payment:    { icon: 'shopping_cart', color: 'text-primary',   bg: 'bg-primary/10' },
};
