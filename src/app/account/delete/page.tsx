import type { Metadata } from 'next';
import { legal } from '@/locales/fr/legal';
import { DeleteAccountContent } from './DeleteAccountContent';

export const metadata: Metadata = {
    title: legal.deleteAccount.metaTitle,
    description: legal.deleteAccount.metaDescription,
    robots: { index: true, follow: true },
};

export default function AccountDeletePage() {
    return <DeleteAccountContent />;
}
