import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.medhira.taxi',
    appName: 'Medhira Taxi',
    webDir: 'out',
    server: {
        androidScheme: 'https'
    },
    plugins: {
        Geolocation: {
            saveToGallery: false
        }
    }
};

export default config;
