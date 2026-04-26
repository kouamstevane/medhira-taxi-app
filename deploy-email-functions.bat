@echo off
REM ============================================================================
REM Script de déploiement des fonctions d'envoi d'emails via Resend (Windows)
REM ============================================================================
REM Ce script déploie les fonctions Firebase mises à jour qui utilisent
REM Firebase Secret Manager pour les secrets (approche Functions v2).
REM
REM Utilisation:
REM   deploy-email-functions.bat
REM
REM Prérequis:
REM   - Firebase CLI installé
REM   - Connecté à Firebase (firebase login)
REM   - Clé API Resend disponible
REM   - Secrets configurés dans Firebase Secret Manager
REM ============================================================================

setlocal enabledelayedexpansion

REM ============================================================================
REM Vérification des prérequis
REM ============================================================================
echo [INFO] Verification des prerequis...

REM Vérifier que Firebase CLI est installé
where firebase >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Firebase CLI n'est pas installe. Installez-le avec: npm install -g firebase-tools
    exit /b 1
)

REM ============================================================================
REM Vérification de la configuration des secrets
REM ============================================================================
echo [INFO] Verification de la configuration des secrets...

REM Vérifier si les secrets existent déjà
echo [INFO] Verification des secrets Firebase Secret Manager...
firebase secrets:list >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Impossible de lister les secrets. Assurez-vous d'avoir les permissions necessaires.
)

REM ============================================================================
REM Chargement de la configuration
REM ============================================================================
echo [INFO] Chargement de la configuration...

if exist .env (
    echo [INFO] Fichier .env trouve
) else (
    echo [WARNING] Fichier .env non trouve. Utilisation des valeurs par defaut.
)

REM ============================================================================
REM Configuration des secrets (si nécessaire)
REM ============================================================================
echo.
echo [INFO] ============================================================================
echo [INFO] CONFIGURATION DES SECRETS FIREBASE SECRET MANAGER
echo [INFO] ============================================================================
echo.
echo [INFO] Les secrets suivants sont requis pour le deploiement:
echo   - RESEND_API_KEY: Cle API Resend pour l'envoi d'emails
echo   - AGORA_APP_ID: ID d'application Agora (pour VoIP)
echo   - AGORA_APP_CERTIFICATE: Certificat Agora (pour VoIP)
echo   - ENCRYPTION_MASTER_KEY: Cle de chiffrement maitre
echo.
echo [INFO] Si les secrets ne sont pas encore configures, executez d'abord:
echo   setup-secrets.bat
echo.

REM Demander si l'utilisateur veut configurer les secrets maintenant
set /p CONFIGURE_SECRETS="Voulez-vous configurer les secrets maintenant? (y/n): "
if /i "%CONFIGURE_SECRETS%"=="y" (
    echo.
    echo [INFO] Configuration de RESEND_API_KEY...
    set /p RESEND_API_KEY="Entrez votre cle API Resend (re_xxxxxxxxxxxxx): "
    
    REM Ajouter le secret à Secret Manager
    echo !RESEND_API_KEY! | firebase secrets:add RESEND_API_KEY
    if %errorlevel% neq 0 (
        echo [ERROR] Erreur lors de l'ajout du secret RESEND_API_KEY
        exit /b 1
    )
    echo [SUCCESS] Secret RESEND_API_KEY configure avec succes
    
    REM Demander les autres secrets si nécessaires
    echo.
    set /p CONFIGURE_AGORA="Voulez-vous configurer les secrets Agora? (y/n): "
    if /i "%CONFIGURE_AGORA%"=="y" (
        set /p AGORA_APP_ID="Entrez votre Agora App ID: "
        echo !AGORA_APP_ID! | firebase secrets:add AGORA_APP_ID
        
        set /p AGORA_APP_CERTIFICATE="Entrez votre Agora App Certificate: "
        echo !AGORA_APP_CERTIFICATE! | firebase secrets:add AGORA_APP_CERTIFICATE
        echo [SUCCESS] Secrets Agora configures avec succes
    )
    
    echo.
    set /p CONFIGURE_ENCRYPTION="Voulez-vous configurer la cle de chiffrement? (y/n): "
    if /i "%CONFIGURE_ENCRYPTION%"=="y" (
        echo [INFO] Generation d'une nouvelle cle de chiffrement...
        node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" > temp_key.txt
        set /p ENCRYPTION_MASTER_KEY=<temp_key.txt
        del temp_key.txt
        
        echo !ENCRYPTION_MASTER_KEY! | firebase secrets:add ENCRYPTION_MASTER_KEY
        echo [SUCCESS] Cle de chiffrement configuree avec succes
    )
)

REM ============================================================================
REM Construction des fonctions
REM ============================================================================
echo.
echo [INFO] ============================================================================
echo [INFO] CONSTRUCTION DES FONCTIONS FIREBASE
echo [INFO] ============================================================================
echo [INFO] Construction des fonctions Firebase...
cd functions

REM Installer les dépendances si nécessaire
if not exist "node_modules" (
    echo [INFO] Installation des dependances...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Erreur lors de l'installation des dependances
        cd ..
        exit /b 1
    )
)

REM Compiler les fonctions TypeScript
echo [INFO] Compilation TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Erreur lors de la compilation TypeScript
    cd ..
    exit /b 1
)

cd ..
echo [SUCCESS] Fonctions construites avec succes

REM ============================================================================
REM Déploiement des fonctions
REM ============================================================================
echo.
echo [INFO] ============================================================================
echo [INFO] DEPLOIEMENT DES FONCTIONS FIREBASE
echo [INFO] ============================================================================
echo [INFO] Deploiement des fonctions Firebase...
echo [INFO] Les secrets seront automatiquement deploies avec les fonctions.

REM Déployer uniquement les fonctions d'email
firebase deploy --only functions:sendVerificationEmail,functions:sendVerificationEmailHttp

if %errorlevel% neq 0 (
    echo [ERROR] Erreur lors du deploiement
    echo [WARNING] Assurez-vous que les secrets sont correctement configures dans Secret Manager
    echo [INFO] Verifiez avec: firebase secrets:list
    cd ..
    exit /b 1
)

echo [SUCCESS] Deploiement termine avec succes!

REM ============================================================================
REM Vérification du déploiement
REM ============================================================================
echo.
echo [INFO] ============================================================================
echo [INFO] VERIFICATION DU DEPLOIEMENT
echo [INFO] ============================================================================
echo [INFO] Verification du deploiement...

REM Lister les fonctions déployées
firebase functions:list

REM ============================================================================
REM Instructions post-déploiement
REM ============================================================================
echo.
echo [SUCCESS] ==========================================
echo [SUCCESS] Deploiement termine avec succes!
echo [SUCCESS] ==========================================
echo.
echo [INFO] Prochaines etapes:
echo   1. Verifiez vos fonctions deployees dans Firebase Console
echo   2. Testez l'envoi d'email depuis l'application
echo   3. Surveillez les logs dans Firebase Console
echo.
echo [WARNING] IMPORTANT:
echo   - Assurez-vous que votre domaine d'envoi est verifie dans Resend
echo   - Configurez SPF/DKIM pour votre domaine dans Resend
echo   - Les secrets sont maintenant geres via Firebase Secret Manager
echo   - Ne plus utiliser functions:config pour ces variables
echo.
echo [INFO] Pour voir les secrets configures:
echo   firebase secrets:list
echo.
echo [INFO] Pour voir les logs en temps reel:
echo   firebase functions:log
echo.
echo [INFO] Pour tester localement avec l'emulateur:
echo   firebase emulators:start
echo.
echo [INFO] Pour mettre a jour un secret:
echo   echo "nouvelle_valeur" ^| firebase secrets:update RESEND_API_KEY
echo.

endlocal
