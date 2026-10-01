'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

const LAST_UPDATED_KEY = 'legal.privacy.updatedDate' as const;
const CONTACT_EMAIL = 'privacy@medjira.com';
const SUPPORT_EMAIL = 'support@medjira.com';
const COMPANY_NAME = 'Medjira Service';
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

const DIRECT = ['identity', 'contact', 'credentials', 'photo', 'payment'] as const;
const AUTO = ['gps', 'background', 'technical', 'diagnostics', 'usage'] as const;
const GENERATED = ['history', 'comms', 'voip', 'proof'] as const;

const ROWS = [
    ['account', 'contract'],
    ['matching', 'contract'],
    ['payment', 'contractLegal'],
    ['verification', 'legalTransport'],
    ['rideNotifications', 'contract'],
    ['marketing', 'consent'],
    ['security', 'legitimate'],
    ['improvement', 'legitimate'],
    ['judicial', 'legal'],
] as const;

const PROCESSORS = ['firebase', 'maps', 'stripe', 'twilio'] as const;
const RETENTION = [
    'active',
    'inactive',
    'history',
    'location',
    'voip',
    'security',
    'documents',
] as const;
const RIGHTS = [
    'access',
    'rectification',
    'erasure',
    'restriction',
    'portability',
    'objection',
    'withdraw',
    'postMortem',
] as const;
const SECURITY = ['tls', 'storage', 'mfa', 'access', 'payments'] as const;
const PERMISSIONS = [
    'location',
    'background',
    'microphone',
    'camera',
    'notifications',
    'bluetooth',
] as const;

export default function PrivacyContent() {
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
                        {t('legal.privacy.title')}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t('legal.privacy.lastUpdated', { date: t(LAST_UPDATED_KEY) })}
                    </p>
                </header>

                <article className="prose prose-invert max-w-none space-y-8 text-[15px] leading-7">
                    <section>
                        <p>
                            <Rich text={t('legal.privacy.intro1', { company: COMPANY_NAME })} />
                        </p>
                        <p>
                            <Rich text={t('legal.privacy.intro2')} />
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s1.title')}</h2>
                        <p>
                            <strong>{COMPANY_NAME}</strong>
                            <br />
                            {t('legal.common.companyAddress')}
                            <br />
                            {t('legal.privacy.s1.websiteLabel')}{' '}
                            <a href={WEBSITE} className={linkClass}>
                                {WEBSITE}
                            </a>
                            <br />
                            {t('legal.privacy.s1.contactLabel')}{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                                {CONTACT_EMAIL}
                            </a>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s2.title')}</h2>

                        <h3 className="mt-4 text-lg font-semibold">
                            {t('legal.privacy.s2.directTitle')}
                        </h3>
                        <ul className="list-disc pl-6">
                            {DIRECT.map((k) => (
                                <li key={k}>
                                    <Rich text={t(`legal.privacy.s2.direct.${k}`)} />
                                </li>
                            ))}
                        </ul>

                        <h3 className="mt-4 text-lg font-semibold">
                            {t('legal.privacy.s2.autoTitle')}
                        </h3>
                        <ul className="list-disc pl-6">
                            {AUTO.map((k) => (
                                <li key={k}>
                                    <Rich text={t(`legal.privacy.s2.auto.${k}`)} />
                                </li>
                            ))}
                        </ul>

                        <h3 className="mt-4 text-lg font-semibold">
                            {t('legal.privacy.s2.generatedTitle')}
                        </h3>
                        <ul className="list-disc pl-6">
                            {GENERATED.map((k) => (
                                <li key={k}>
                                    <Rich text={t(`legal.privacy.s2.generated.${k}`)} />
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s3.title')}</h2>
                        <div className="overflow-x-auto">
                            <table className="my-4 w-full border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-card">
                                        <th className="p-2 text-left">
                                            {t('legal.privacy.s3.colPurpose')}
                                        </th>
                                        <th className="p-2 text-left">
                                            {t('legal.privacy.s3.colBasis')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ROWS.map(([purpose, basis], i) => (
                                        <tr
                                            key={purpose}
                                            className={
                                                i < ROWS.length - 1
                                                    ? 'border-b border-border'
                                                    : undefined
                                            }
                                        >
                                            <td className="p-2">
                                                {t(`legal.privacy.s3.purposes.${purpose}`)}
                                            </td>
                                            <td className="p-2">
                                                {t(`legal.privacy.s3.bases.${basis}`)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s4.title')}</h2>
                        <p>{t('legal.privacy.s4.intro')}</p>
                        <ul className="list-disc pl-6">
                            <li>
                                <Rich text={t('legal.privacy.s4.counterpart')} />
                            </li>
                            <li>
                                <Rich text={t('legal.privacy.s4.processors')} />
                                <ul className="mt-1 list-disc pl-6">
                                    {PROCESSORS.map((k) => (
                                        <li key={k}>
                                            <Rich text={t(`legal.privacy.s4.${k}`)} />
                                        </li>
                                    ))}
                                </ul>
                            </li>
                            <li>
                                <Rich text={t('legal.privacy.s4.authorities')} />
                            </li>
                            <li>
                                <Rich text={t('legal.privacy.s4.transfer')} />
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s5.title')}</h2>
                        <p>
                            <Rich text={t('legal.privacy.s5.text')} />
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s6.title')}</h2>
                        <ul className="list-disc pl-6">
                            {RETENTION.map((k) => (
                                <li key={k}>
                                    <Rich text={t(`legal.privacy.s6.${k}`)} />
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s7.title')}</h2>
                        <p>{t('legal.privacy.s7.intro')}</p>
                        <ul className="list-disc pl-6">
                            {RIGHTS.map((k) => (
                                <li key={k}>
                                    <Rich text={t(`legal.privacy.s7.${k}`)} />
                                </li>
                            ))}
                        </ul>
                        <p>
                            {t('legal.privacy.s7.exerciseBefore')}{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                                {CONTACT_EMAIL}
                            </a>{' '}
                            {t('legal.privacy.s7.exerciseAfter')}
                        </p>
                        <p>
                            <Rich text={t('legal.privacy.s7.deleteBefore')} />{' '}
                            <a href={`${WEBSITE}/account/delete`} className={linkClass}>
                                {WEBSITE}/account/delete
                            </a>
                            .
                        </p>
                        <p>
                            <Rich text={t('legal.privacy.s7.complaintBefore')} />{' '}
                            <a
                                href="https://www.cnil.fr/fr/plaintes"
                                className={linkClass}
                                target="_blank"
                                rel="noreferrer"
                            >
                                www.cnil.fr/fr/plaintes
                            </a>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s8.title')}</h2>
                        <ul className="list-disc pl-6">
                            {SECURITY.map((k) => (
                                <li key={k}>{t(`legal.privacy.s8.${k}`)}</li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s9.title')}</h2>
                        <ul className="list-disc pl-6">
                            {PERMISSIONS.map((k) => (
                                <li key={k}>
                                    <Rich text={t(`legal.privacy.s9.${k}`)} />
                                </li>
                            ))}
                        </ul>
                        <p>{t('legal.privacy.s9.revoke')}</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s10.title')}</h2>
                        <p>
                            <Rich text={t('legal.privacy.s10.text')} />
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s11.title')}</h2>
                        <p>{t('legal.privacy.s11.text')}</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s12.title')}</h2>
                        <p>{t('legal.privacy.s12.text')}</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">{t('legal.privacy.s13.title')}</h2>
                        <p>
                            {t('legal.privacy.s13.intro')}
                            <br />
                            {t('legal.privacy.s13.personal')}{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                                {CONTACT_EMAIL}
                            </a>
                            <br />
                            {t('legal.privacy.s13.support')}{' '}
                            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                                {SUPPORT_EMAIL}
                            </a>
                            <br />
                            {t('legal.privacy.s13.site')}{' '}
                            <a href={WEBSITE} className={linkClass}>
                                {WEBSITE}
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
