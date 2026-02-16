@echo off
echo Configuration du developpement Capacitor pour Android...
echo.

echo Trouvez votre adresse IP locale ci-dessous :
ipconfig | findstr "IPv4"
echo.

set /p IP_ADDRESS="Entrez votre adresse IP (ex: 192.168.1.100) : "

echo.
echo Configuration de l'adresse IP : %IP_ADDRESS%
echo CAPACITOR_ANDROID_IP=%IP_ADDRESS% > .env.local

echo.
echo Configuration terminee !
echo.
echo Pour le developpement, executez ces commandes dans des terminaux separes :
echo.
echo Terminal 1 - Serveur Next.js :
echo   npm run dev
echo.
echo Terminal 2 - Synchronisation Capacitor :
echo   npx cap sync android
echo.
echo Terminal 3 - Lancement de l'app :
echo   npx cap run android
echo.
echo IMPORTANT : Votre telephone et votre ordinateur doivent etre sur le meme reseau WiFi !
echo.
