import { Capacitor } from '@capacitor/core';

export const getApiBaseUrl = () => {
    if (Capacitor.isNativePlatform()) {
        // En production mobile, cela devrait pointer vers votre URL de déploiement Vercel/VPS
        // Pour le développement local avec un appareil physique, utilisez l'IP de votre machine
        // EXEMPLE: return 'http://192.168.1.15:3000';
        return process.env.NEXT_PUBLIC_API_URL || 'https://medhira-taxi.vercel.app';
    }
    return ''; // Relatif pour le web
};
