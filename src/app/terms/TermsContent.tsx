'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

const COMPANY_NAME = 'Medjira Service';
const SUPPORT_EMAIL = 'support@medjira.com';
const LEGAL_EMAIL = 'legal@medjira.com';
const WEBSITE = 'https://medjira.com';

/** Rend le balisage minimal <b>…</b> / <i>…</i> sans dangerouslySetInnerHTML. */
function Rich({ text }: { text: string }): ReactNode {
    const parts = text.split(/(<b>.*?<\/b>|<i>.*?<\/i>)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('<b>')) {
                    return <strong key={i}>{part.slice(3, -4)}</strong>;
                }
                if (part.startsWith('<i>')) {
                    return <em key={i}>{part.slice(3, -4)}</em>;
                }
                return part;
            })}
        </>
    );
}

const ACCOUNT = ['age', 'accuracy', 'credentials', 'drivers'] as const;
const CANCELLATION = ['cancelFree', 'cancelFee', 'noShow'] as const;
const OBLIGATIONS = ['o1', 'o2', 'o3', 'o4', 'o5'] as const;
const LIABILITY = ['l1', 'l2', 'l3'] as const;

export default function TermsContent() {
    const { t } = useTranslation();
    const linkClass = 'text-primary hover:underline';

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
                <header className="mb-10 border-b border-border pb-6">
                    <Link href="/" className="text-sm text-primary hover:underline">
                        {t('legal.common.backHome')}
                    </Link>
                    <h1 className="mt-4 text-3xl font-bold sm:text-4xl">
                        {t('legal.terms.title')}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t('legal.terms.lastUpdated', { date: t('legal.terms.updatedDate') })}
                    </p>
                </header>

                <article className="prose prose-invert max-w-none space-y-8 text-[15px] leading-7">
                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s1.title')}</h2>
                        <p>
                            <Rich text={t('legal.terms.s1.text', { company: COMPANY_NAME })} />
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s2.title')}</h2>
                        <p>
                            <strong>{COMPANY_NAME}</strong>
                            <br />
                            {t('legal.common.companyAddress')}
                            <br />
                            {t('legal.terms.s2.siteLabel')}{' '}
                            <a href={WEBSITE} className={linkClass}>
                                {WEBSITE}
                            </a>
                            <br />
                            {t('legal.terms.s2.contactLabel')}{' '}
                            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                                {SUPPORT_EMAIL}
                            </a>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s3.title')}</h2>
                        <p>
                            <Rich text={t('legal.terms.s3.text1')} />
                        </p>
                        <p>{t('legal.terms.s3.text2')}</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s4.title')}</h2>
                        <ul className="list-disc pl-6">
                            {ACCOUNT.map((k) => (
                                <li key={k}>{t(`legal.terms.s4.${k}`)}</li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s5.title')}</h2>
                        <h3 className="mt-4 text-lg font-semibold">
                            {t('legal.terms.s5.pricingTitle')}
                        </h3>
                        <p>{t('legal.terms.s5.pricing')}</p>

                        <h3 className="mt-4 text-lg font-semibold">
                            {t('legal.terms.s5.paymentTitle')}
                        </h3>
                        <p>
                            <Rich text={t('legal.terms.s5.payment')} />
                        </p>

                        <h3 className="mt-4 text-lg font-semibold">
                            {t('legal.terms.s5.cancellationTitle')}
                        </h3>
                        <ul className="list-disc pl-6">
                            {CANCELLATION.map((k) => (
                                <li key={k}>{t(`legal.terms.s5.${k}`)}</li>
                            ))}
                        </ul>

                        <h3 className="mt-4 text-lg font-semibold">
                            {t('legal.terms.s5.refundTitle')}
                        </h3>
                        <p>
                            {t('legal.terms.s5.refundBefore')}{' '}
                            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                                {SUPPORT_EMAIL}
                            </a>{' '}
                            {t('legal.terms.s5.refundAfter')}
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s6.title')}</h2>
                        <p>{t('legal.terms.s6.intro')}</p>
                        <ul className="list-disc pl-6">
                            {OBLIGATIONS.map((k) => (
                                <li key={k}>{t(`legal.terms.s6.${k}`)}</li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s7.title')}</h2>
                        <p>
                            <Rich text={t('legal.terms.s7.intro')} />
                        </p>
                        <ul className="list-disc pl-6">
                            {LIABILITY.map((k) => (
                                <li key={k}>{t(`legal.terms.s7.${k}`)}</li>
                            ))}
                        </ul>
                        <p>{t('legal.terms.s7.limit')}</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s8.title')}</h2>
                        <p>
                            {t('legal.terms.s8.before')}{' '}
                            <Link href="/privacy" className={linkClass}>
                                {t('legal.terms.s8.privacyLink')}
                            </Link>
                            {t('legal.terms.s8.middle')}{' '}
                            <Link href="/account/delete" className={linkClass}>
                                {WEBSITE}/account/delete
                            </Link>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s9.title')}</h2>
                        <p>{t('legal.terms.s9.text', { company: COMPANY_NAME })}</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s10.title')}</h2>
                        <p>{t('legal.terms.s10.text')}</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s11.title')}</h2>
                        <p>{t('legal.terms.s11.text')}</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s12.title')}</h2>
                        <p>
                            <Rich text={t('legal.terms.s12.before')} />{' '}
                            <a
                                href="https://ec.europa.eu/consumers/odr"
                                className={linkClass}
                                target="_blank"
                                rel="noreferrer"
                            >
                                ec.europa.eu/consumers/odr
                            </a>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.terms.s13.title')}</h2>
                        <p>
                            {t('legal.terms.s13.support')}{' '}
                            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                                {SUPPORT_EMAIL}
                            </a>
                            <br />
                            {t('legal.terms.s13.legal')}{' '}
                            <a href={`mailto:${LEGAL_EMAIL}`} className={linkClass}>
                                {LEGAL_EMAIL}
                            </a>
                        </p>
                    </section>
                </article>

                <footer className="mt-12 border-t border-border pt-6 text-center text-sm text-muted-foreground">
                    <Link href="/" className="text-primary hover:underline">
                        {t('legal.common.backHome')}
                    </Link>
                </footer>
            </div>
        </main>
    );
}
