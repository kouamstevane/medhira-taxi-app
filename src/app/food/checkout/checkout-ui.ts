import { translate } from '@/locales';

export const PROFILE_ADDRESS_EDIT_HREF = '/profil?edit=address';

export const CHECKOUT_FOOTER_CLASS =
  'fixed bottom-20 inset-x-0 p-4 bg-background/80 backdrop-blur-xl border-t border-white/5 z-40 max-w-[430px] mx-auto';

export function getFoodCheckoutErrorMessage(error: unknown, t: (key: string) => string = translate): string {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (
    candidate?.code === 'invalid-argument'
    || candidate?.message === 'Données de commande invalides.'
  ) {
    return t('food.checkoutInvalidArgumentError');
  }

  return candidate && typeof candidate.message === 'string' && candidate.message.trim()
    ? candidate.message
    : t('food.checkoutGenericError');
}
