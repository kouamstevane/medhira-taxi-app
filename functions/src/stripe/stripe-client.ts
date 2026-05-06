import Stripe from 'stripe';

type StripeClient = InstanceType<typeof Stripe>;
type StripeOptions = ConstructorParameters<typeof Stripe>[1];

export function buildStripeOptions(extra?: StripeOptions): StripeOptions {
  const opts: NonNullable<StripeOptions> = {
    apiVersion: '2026-03-25.dahlia',
    ...extra,
  };
  if (
    process.env.FUNCTIONS_EMULATOR === 'true' &&
    process.env.STRIPE_API_HOST
  ) {
    opts.host = process.env.STRIPE_API_HOST;
    opts.port = process.env.STRIPE_API_PORT
      ? Number(process.env.STRIPE_API_PORT)
      : 12111;
    opts.protocol = (process.env.STRIPE_API_PROTOCOL as
      | 'http'
      | 'https') ?? 'http';
  }
  return opts;
}

export function createStripeClient(
  secret: string,
  extra?: StripeOptions,
): StripeClient {
  return new Stripe(secret, buildStripeOptions(extra));
}
