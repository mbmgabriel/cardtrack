import type { TransactionType } from '@/domain/types';

/** One icon per transaction type, used wherever the type is picked or shown. */
export const TYPE_ICONS: Record<TransactionType, string> = {
  purchase: 'cart-outline',
  refund: 'cash-refund',
  payment: 'credit-card-check-outline',
  transfer: 'swap-horizontal',
  deposit: 'bank-transfer-in',
  withdrawal: 'bank-transfer-out',
  fee: 'receipt-text-minus-outline',
  interest: 'percent-outline',
  cash_advance: 'cash-fast',
  adjustment: 'tune-variant',
};
