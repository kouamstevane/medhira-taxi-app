import type { DeepString } from '../types';
import type { wallet as WalletFr } from '../fr/wallet';

export const wallet: DeepString<typeof WalletFr> = {
  title: 'Medjira Wallet',
  subtitle: 'Manage your balance and secure payment methods',
  balance: 'Wallet balance',
  currentBalance: 'Available balance',
  recharge: 'Top up my account',
  topUp: 'Top up',
  rechargeAmount: 'Top-up amount',
  customAmount: 'Custom amount',
  selectAmount: 'Select an amount',
  paymentMethod: 'Payment method',
  addPaymentMethod: 'Add a card',
  transactionsHistory: 'Transaction history',
  recentTransactions: 'Recent transactions',
  noTransactions: 'No transactions',
  noTransactionsRegistered: 'No transactions registered.',
  noTransactionsInCategory: 'No transactions in this category.',
  deposit: 'Wallet top-up',
  payment: 'Payment',
  ridePayment: 'Taxi ride payment',
  foodPayment: 'Meal order payment',
  parcelPayment: 'Parcel delivery payment',
  refund: 'Refund',
  payout: 'Payout',
  status: {
    completed: 'Completed',
    pending: 'Pending',
    failed: 'Failed',
  },
  rechargeSuccess: 'Your account has been topped up by {amount} successfully!',
  securePaymentByStripe: 'Secure and encrypted payment by Stripe',

  // Filters
  filters: {
    all: 'All',
    deposit: 'Top-ups',
    payment: 'Payments',
    withdrawal: 'Expenses',
  },

  // Historique page
  historyTitle: 'History',
  totalCredits: 'Total credits',
  totalDebits: 'Total expenses',
  loadMore: 'Load more',
  loadingMore: 'Loading...',

  // Recharger page
  payWithCard: 'Card payment',
  amountToRechargeWithCurrency: 'Amount to top up ({currency})',
  creditCardOption: 'Credit / Debit Card',
  creditCardSubtitle: 'Visa · Mastercard · Apple Pay · Google Pay',
  continueToPayment: 'Continue to payment',
  processing: 'Processing...',
  noExtraFees: 'No extra fees · Secure processing by Stripe',
  webhookNotice: 'Balance is credited via Stripe webhook upon payment confirmation',
  minAmountNotice: 'Minimum amount is {min} {currency}',
  mustBeLoggedIn: 'You must be logged in to top up',
  pendingProcessing: 'Top-up is processing. Your balance will update in a few moments.',
};
