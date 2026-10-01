import type { Metadata } from 'next';
import { legal } from '@/locales/fr/legal';
import PrivacyContent from './PrivacyContent';

// Les métadonnées sont rendues côté serveur (pas de contexte de langue) :
// on utilise le dictionnaire français par défaut.
export const metadata: Metadata = {
    title: legal.privacy.metaTitle,
    description: legal.privacy.metaDescription,
    robots: { index: true, follow: true },
};

export default function PrivacyPage() {
    return <PrivacyContent />;
}
