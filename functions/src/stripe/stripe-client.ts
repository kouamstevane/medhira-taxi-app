import type StripeNS from 'stripe';

type StripeClient = InstanceType<typeof StripeNS>;
type StripeOptions = ConstructorParameters<typeof StripeNS>[1];

let _StripeCtor: typeof StripeNS | null = null;
function loadStripeCtor(): typeof StripeNS {
  if (!_StripeCtor) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('stripe');
    _StripeCtor = (mod.default ?? mod) as typeof StripeNS;
  }
  return _StripeCtor;
}

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
    const proto = process.env.STRIPE_API_PROTOCOL;
    opts.protocol = proto === 'https' ? 'https' : 'http';
  }
  return opts;
}

export function createStripeClient(
  secret: string,
  extra?: StripeOptions,
): StripeClient {
  const Stripe = loadStripeCtor();
  return new Stripe(secret, buildStripeOptions(extra));
}

export function isStripeError(err: unknown): err is InstanceType<typeof StripeNS.errors.StripeError> {
  if (!_StripeCtor) return false;
  return err instanceof _StripeCtor.errors.StripeError;
}
