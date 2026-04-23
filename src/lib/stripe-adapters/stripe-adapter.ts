export interface PaymentResult {
  paymentIntentId: string;
  status: 'succeeded' | 'requires_capture' | 'canceled';
}

export interface SetupResult {
  setupIntentId: string;
  status: 'succeeded';
}

export interface PayParams {
  clientSecret: string;
  amount: number;
  currency: string;
}

export interface SetupCardParams {
  clientSecret: string;
}

export interface StripeAdapter {
  readonly platform: 'native' | 'web';
  init(): Promise<void>;
  pay(params: PayParams): Promise<PaymentResult>;
  setupCard(params: SetupCardParams): Promise<SetupResult>;
  isReady(): boolean;
}
