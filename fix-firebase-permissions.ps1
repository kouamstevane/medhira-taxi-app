# Script PowerShell pour diagnostiquer et résoudre les problèmes de permissions Firebase
# A exécuter en tant qu'administrateur

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Diagnostic de déploiement Firebase Functions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si Firebase CLI est installé
Write-Host "[1/6] Vérification de Firebase CLI..." -ForegroundColor Yellow
try {
    $firebaseVersion = firebase --version
    Write-Host "✓ Firebase CLI version: $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Firebase CLI non trouvé. Installation en cours..." -ForegroundColor Red
    npm install -g firebase-tools
    Write-Host "✓ Firebase CLI installé" -ForegroundColor Green
}
Write-Host ""

# Vérifier la connexion Firebase
Write-Host "[2/6] Vérification de la connexion Firebase..." -ForegroundColor Yellow
$projects = firebase projects:list 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Connecté à Firebase" -ForegroundColor Green
    Write-Host $projects
} else {
    Write-Host "✗ Non connecté à Firebase" -ForegroundColor Red
    Write-Host "Veuillez exécuter: firebase login" -ForegroundColor Yellow
    Read-Host "Appuyez sur Entrée après vous être connecté"
}
Write-Host ""

# Vérifier le projet actif
Write-Host "[3/6] Vérification du projet actif..." -ForegroundColor Yellow
$useOutput = firebase use 2>&1
Write-Host $useOutput
Write-Host ""

# Compiler les fonctions localement
Write-Host "[4/6] Compilation des fonctions..." -ForegroundColor Yellow
Set-Location functions
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Fonctions compilées avec succès" -ForegroundColor Green
} else {
    Write-Host "✗ Erreur de compilation:" -ForegroundColor Red
    Write-Host $buildResult
}
Set-Location ..
Write-Host ""

# Essayer de déployer avec debug
Write-Host "[5/6] Tentative de déploiement avec debug..." -ForegroundColor Yellow
Write-Host "Cela peut prendre quelques minutes..." -ForegroundColor Cyan
$deployResult = firebase deploy --only functions --debug 2>&1
Write-Host $deployResult

# Analyser le résultat
if ($deployResult -match "403|permission|authorized") {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "PROBLÈME DÉTECTÉ: Permissions IAM insuffisantes" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUTIONS:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Allez sur la console Google Cloud IAM:" -ForegroundColor White
    Write-Host "   https://console.cloud.google.com/iam-admin/iam?project=medjira-service" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Ajoutez les rôles suivants à votre compte:" -ForegroundColor White
    Write-Host "   - Cloud Functions Developer" -ForegroundColor Cyan
    Write-Host "   - Firebase Admin ou Editor" -ForegroundColor Cyan
    Write-Host "   - Service Account User" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "3. Attendez quelques minutes que les permissions se propagent" -ForegroundColor White
    Write-Host "4. Réessayez: firebase deploy --only functions" -ForegroundColor White
    Write-Host ""
} elseif ($deployResult -match "successfully deployed|Deploy complete!") {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✓ DÉPLOIEMENT RÉUSSI!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
}
Write-Host ""

# Informations supplémentaires
Write-Host "[6/6] Informations supplémentaires..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Ressources utiles:" -ForegroundColor White
Write-Host "- Console IAM: https://console.cloud.google.com/iam-admin/iam?project=medjira-service" -ForegroundColor Cyan
Write-Host "- Console Functions: https://console.cloud.google.com/functions/list?project=medjira-service" -ForegroundColor Cyan
Write-Host "- Documentation IAM: https://firebase.google.com/docs/projects/iam" -ForegroundColor Cyan
Write-Host ""

Read-Host "Appuyez sur Entrée pour quitter"
