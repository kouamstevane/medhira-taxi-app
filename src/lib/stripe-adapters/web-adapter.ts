import type { StripeAdapter, PayParams, PaymentResult, SetupCardParams, SetupResult } from './stripe-adapter';

export class WebStripeAdapter implements StripeAdapter {
  readonly platform = 'web' as const;
  private _ready = false;

  async init(): Promise<void> {
    this._ready = true;
  }

  isReady(): boolean {
    return this._ready;
  }

  async pay(_params: PayParams): Promise<PaymentResult> {
    throw new Error(
      'WebStripeAdapter.pay() should not be called directly. ' +
      'Use the <Elements>/<PaymentElement> components from @stripe/react-stripe-js instead. ' +
      'The web flow uses StripePaymentElement (web path) which handles confirmation internally.'
    );
  }

  async setupCard(_params: SetupCardParams): Promise<SetupResult> {
    throw new Error(
      'WebStripeAdapter.setupCard() should not be called directly. ' +
      'Use the <Elements>/<PaymentElement> components from @stripe/react-stripe-js instead. ' +
      'The web flow uses SetupPaymentContent (web path) which handles confirmation internally.'
    );
  }
}
