@echo off
REM ============================================================
REM Generation du keystore release pour Medjira Taxi
REM ============================================================
REM
REM IMPORTANT : Conservez le keystore (.keystore) ET le fichier
REM keystore.properties dans plusieurs endroits sécurisés
REM (cloud chiffré + disque externe). PERTE = APP PERDUE.
REM
REM ============================================================

setlocal

set KEYSTORE_PATH=app\medjira-release.keystore
set KEY_ALIAS=medjira

if exist %KEYSTORE_PATH% (
    echo.
    echo [ERREUR] Le keystore existe deja: %KEYSTORE_PATH%
    echo Si vous voulez en generer un nouveau, supprimez-le d'abord.
    echo ATTENTION: un nouveau keystore signifie une nouvelle app sur Play Store !
    exit /b 1
)

echo.
echo === Generation du keystore release ===
echo.
echo Vous allez devoir saisir:
echo  - Un mot de passe pour le keystore (16+ caracteres recommandes)
echo  - Vos informations (nom, organisation, ville, pays)
echo  - Un mot de passe pour la cle (peut etre identique)
echo.
pause

keytool -genkey -v ^
    -keystore %KEYSTORE_PATH% ^
    -alias %KEY_ALIAS% ^
    -keyalg RSA ^
    -keysize 2048 ^
    -validity 10000

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] La generation du keystore a echoue.
    exit /b 1
)

echo.
echo === Keystore cree avec succes ===
echo.
echo Prochaines etapes:
echo  1. Copiez android\keystore.properties.example vers android\keystore.properties
echo  2. Remplissez les mots de passe que vous venez de saisir
echo  3. SAUVEGARDEZ le fichier %KEYSTORE_PATH% en lieu sur (cloud chiffre + disque externe)
echo  4. Construisez l'AAB: npm run android:bundle
echo.

endlocal
