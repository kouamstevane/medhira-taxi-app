@echo off
echo ============================================================================
echo Configuration du developpement Capacitor avec Live Reload
echo ============================================================================
echo.

echo 1. Trouvez votre adresse IP locale :
ipconfig | findstr "IPv4"
echo.

set /p IP_ADDRESS="Entrez votre adresse IP (ex: 192.168.1.100) : "

echo.
echo 2. Mise a jour de la configuration Capacitor...
echo CAPACITOR_ANDROID_IP=%IP_ADDRESS% > .env.local
echo CAPACITOR_ANDROID_IP=%IP_ADDRESS%

echo.
echo 3. Mise a jour de capacitor.config.ts...
echo La configuration va etre mise a jour automatiquement.
echo.

echo ============================================================================
echo INSTRUCTIONS :
echo ============================================================================
echo.
echo Ouvrez 3 terminaux separes et executez :
echo.
echo TERMINAL 1 (Serveur Next.js) :
echo   npm run dev:mobile
echo.
echo TERMINAL 2 (Synchronisation) :
echo   npx cap sync android
echo.
echo TERMINAL 3 (Lancement application) :
echo   npx cap run android --livereload --external
echo.
echo ============================================================================
echo IMPORTANT :
echo ============================================================================
echo - Votre telephone et votre ordinateur doivent etre sur le meme reseau WiFi
echo - Desactivez les VPN sur les deux appareils
echo - Ajoutez votre IP (%IP_ADDRESS%) dans Firebase Console ^> Authentication ^> Domains autorises
echo ============================================================================
echo.

pause
