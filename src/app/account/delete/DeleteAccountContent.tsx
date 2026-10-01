'use client';

import Link from 'next/link';
import { RichText } from '@/components/legal/RichText';
import { useTranslation } from '@/hooks/useTranslation';

const PRIVACY_EMAIL = 'privacy@medjira.com';
const SUPPORT_EMAIL = 'support@medjira.com';
const APP_NAME = 'Medjira Taxi & Livraison';
const COMPANY_NAME = 'Medjira Service';

const DELETED_ITEMS = ['profile', 'auth', 'addresses', 'payment', 'messages', 'push'] as const;
const KEPT_ITEMS = ['invoices', 'voip', 'security', 'documents'] as const;
const IN_APP_STEPS = ['step1', 'step2', 'step3', 'step4'] as const;
const REQUEST_ITEMS = ['item1', 'item2', 'item3'] as const;

export function DeleteAccountContent() {
  const { t, locale } = useTranslation();
  const k = (key: string, params?: Record<string, string | number>) =>
    t(`legal.deleteAccount.${key}`, params);

  const subject = encodeURIComponent(k('mailSubject'));
  const body = encodeURIComponent(k('mailBody'));
  const mailtoUrl = `mailto:${PRIVACY_EMAIL}?subject=${subject}&body=${body}`;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <header className="mb-10 border-b border-border pb-6">
          <Link href="/" className="text-sm text-primary hover:underline">
            {t('legal.common.backHome')}
          </Link>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{k('title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <RichText text={k('application', { app: APP_NAME, company: COMPANY_NAME })} />
          </p>
        </header>

        <article className="space-y-8 text-[15px] leading-7">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold text-primary">{k('inApp.title')}</h2>
            <p className="mt-2 text-foreground">
              <RichText text={k('inApp.intro')} />
            </p>
            <ol className="mt-3 list-decimal pl-6 text-foreground">
              {IN_APP_STEPS.map((step) => (
                <li key={step}>
                  <RichText text={k(`inApp.${step}`)} />
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">{k('inApp.irreversible')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">{k('noAccess.title')}</h2>
            <p className="mt-2">
              <RichText text={k('noAccess.intro')} />
            </p>

            <div className="mt-5 rounded-lg border border-border bg-card p-5">
              <p className="font-semibold">{k('noAccess.indicate')}</p>
              <ul className="mt-2 list-disc pl-6">
                {REQUEST_ITEMS.map((item) => (
                  <li key={item}>{k(`noAccess.${item}`)}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">{k('noAccess.verification')}</p>

              <a
                href={mailtoUrl}
                className="mt-5 inline-block rounded-md bg-red-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                {k('noAccess.sendButton', { email: PRIVACY_EMAIL })}
              </a>

              <p className="mt-3 text-xs text-muted-foreground">
                {k('noAccess.fallback')}{' '}
                <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary hover:underline">
                  {PRIVACY_EMAIL}
                </a>
                .
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">{k('deleted.title')}</h2>
            <p className="mt-2">{k('deleted.intro')}</p>
            <ul className="mt-2 list-disc pl-6">
              {DELETED_ITEMS.map((item) => (
                <li key={item}>{k(`deleted.${item}`)}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">{k('kept.title')}</h2>
            <p className="mt-2">{k('kept.intro')}</p>
            <ul className="mt-2 list-disc pl-6">
              {KEPT_ITEMS.map((item) => (
                <li key={item}>
                  <RichText text={k(`kept.${item}`)} />
                </li>
              ))}
            </ul>
            <p className="mt-3">
              {k('kept.more')}{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                {k('privacyLink')}
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">{k('timing.title')}</h2>
            <ul className="mt-2 list-disc pl-6">
              <li>
                <RichText text={k('timing.inApp')} />
              </li>
              <li>
                <RichText text={k('timing.email')} />
              </li>
              <li>{k('timing.confirmation')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">{k('contact.title')}</h2>
            <p className="mt-2">
              {k('contact.privacy')}{' '}
              <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary hover:underline">
                {PRIVACY_EMAIL}
              </a>
              <br />
              {k('contact.support')}{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <RichText text={k('contact.complaint')} />{' '}
              <a
                href="https://www.cnil.fr/fr/plaintes"
                className="text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                www.cnil.fr/fr/plaintes
              </a>
              .
            </p>
          </section>

          {locale !== 'en' && (
            <section lang="en" className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-lg font-semibold text-primary">{k('enSummary.title')}</h2>
              <p className="mt-2 text-foreground">{k('enSummary.intro')}</p>
              <ol className="mt-3 list-decimal pl-6 text-foreground">
                {IN_APP_STEPS.map((step) => (
                  <li key={step}>
                    <RichText text={k(`enSummary.${step}`)} />
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-sm text-muted-foreground">
                {k('enSummary.noAccess')}{' '}
                <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary hover:underline">
                  {PRIVACY_EMAIL}
                </a>{' '}
                {k('enSummary.noAccessDetails')}
              </p>
            </section>
          )}
        </article>

        <footer className="mt-12 border-t border-border pt-6 text-center text-sm text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            {t('legal.common.backHome')}
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="text-primary hover:underline">
            {k('privacyLink')}
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="text-primary hover:underline">
            {k('termsLink')}
          </Link>
        </footer>
      </div>
    </main>
  );
}
