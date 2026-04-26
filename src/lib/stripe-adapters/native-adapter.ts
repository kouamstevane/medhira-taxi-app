import { Capacitor } from '@capacitor/core';
import { Stripe, PaymentSheetEventsEnum } from '@capacitor-community/stripe';
import type { StripeAdapter, PayParams, PaymentResult, SetupCardParams, SetupResult } from './stripe-adapter';

export class NativeStripeAdapter implements StripeAdapter {
  readonly platform = 'native' as const;
  private _ready = false;
  private _publishableKey: string;

  constructor(publishableKey: string) {
    this._publishableKey = publishableKey;
  }

  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('NativeStripeAdapter cannot be initialized on web platform');
    }

    if (!this._publishableKey) {
      throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required for native Stripe initialization');
    }

    await Stripe.initialize({
      publishableKey: this._publishableKey,
    });

    this._ready = true;
  }

  isReady(): boolean {
    return this._ready;
  }

  async pay(params: PayParams): Promise<PaymentResult> {
    if (!this._ready) {
      await this.init();
    }

    const { clientSecret, currency } = params;

    await Stripe.createPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      enableGooglePay: true,
      enableApplePay: true,
      GooglePayIsTesting: process.env.NODE_ENV !== 'production',
      countryCode: 'CA',
      currencyCode: currency.toUpperCase(),
      merchantDisplayName: 'Medjira',
      returnURL: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    const { paymentResult: result } = await Stripe.presentPaymentSheet();

    switch (result) {
      case PaymentSheetEventsEnum.Completed:
        return {
          paymentIntentId: clientSecret.split('_secret_')[0],
          status: 'succeeded',
        };
      case PaymentSheetEventsEnum.Canceled:
        return {
          paymentIntentId: clientSecret.split('_secret_')[0],
          status: 'canceled',
        };
      case PaymentSheetEventsEnum.Failed:
      default:
        throw new Error('Le paiement a échoué. Veuillez réessayer.');
    }
  }

  async setupCard(params: SetupCardParams): Promise<SetupResult> {
    if (!this._ready) {
      await this.init();
    }

    const { clientSecret } = params;

    await Stripe.createPaymentSheet({
      setupIntentClientSecret: clientSecret,
      enableGooglePay: false,
      enableApplePay: false,
      countryCode: 'CA',
      merchantDisplayName: 'Medjira',
      returnURL: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    const { paymentResult: result } = await Stripe.presentPaymentSheet();

    switch (result) {
      case PaymentSheetEventsEnum.Completed:
        return {
          setupIntentId: clientSecret.split('_secret_')[0],
          status: 'succeeded',
        };
      case PaymentSheetEventsEnum.Canceled:
        throw new Error('Configuration de carte annulée.');
      case PaymentSheetEventsEnum.Failed:
      default:
        throw new Error('La configuration de la carte a échoué. Veuillez réessayer.');
    }
  }
}
