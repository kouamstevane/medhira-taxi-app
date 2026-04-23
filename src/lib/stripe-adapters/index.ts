import { Capacitor } from '@capacitor/core';
import type { StripeAdapter } from './stripe-adapter';
import { WebStripeAdapter } from './web-adapter';
import { NativeStripeAdapter } from './native-adapter';

export type { StripeAdapter, PaymentResult, SetupResult, PayParams, SetupCardParams } from './stripe-adapter';

let _adapter: StripeAdapter | null = null;

function createAdapter(): StripeAdapter {
  if (Capacitor.isNativePlatform()) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set');
    }
    return new NativeStripeAdapter(publishableKey);
  }
  return new WebStripeAdapter();
}

export function getStripeAdapter(): StripeAdapter {
  if (!_adapter) {
    _adapter = createAdapter();
  }
  return _adapter;
}

export function isNativeStripe(): boolean {
  return Capacitor.isNativePlatform();
}
