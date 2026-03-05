import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.medjiraservice.medjiraserviceapp',
    appName: 'Medjira',
    webDir: 'out',
    server: {
        androidScheme: 'https',
        // Configuration pour le développement : remplacez VOTRE_IP par votre adresse IP locale
        // Exemple : 192.168.1.100 (trouvez-la avec 'ipconfig' sur Windows ou 'ifconfig' sur Mac/Linux)
        // Pour le développement en mode live-reload avec Next.js
        hostname: process.env.CAPACITOR_ANDROID_IP || 'localhost',
        // En développement, permet le rechargement live depuis votre ordinateur
        cleartext: true
    },
    plugins: {
        Geolocation: {
            saveToGallery: false
        },
        SocialLogin: {
            google: {
                webClientId: '113581657187-6ks0rjk23dah979ngued5pjpe638fq85.apps.googleusercontent.com',
                offlineAccess: true
            }
        }
    }
};

export default config;
