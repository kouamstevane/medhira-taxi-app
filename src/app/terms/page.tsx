import type { Metadata } from 'next';
import { legal } from '@/locales/fr/legal';
import TermsContent from './TermsContent';

// Les métadonnées sont rendues côté serveur (pas de contexte de langue) :
// on utilise le dictionnaire français par défaut.
export const metadata: Metadata = {
    title: legal.terms.metaTitle,
    description: legal.terms.metaDescription,
    robots: { index: true, follow: true },
};

export default function TermsPage() {
    return <TermsContent />;
}
