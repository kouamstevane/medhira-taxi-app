@echo off
REM Script Windows pour exécuter les tests de l'inscription par téléphone
REM 
REM Usage:
REM   run-tests.bat              - Exécuter tous les tests
REM   run-tests.bat unit         - Exécuter uniquement les tests unitaires
REM   run-tests.bat integration  - Exécuter uniquement les tests d'intégration
REM   run-tests.bat e2e          - Exécuter uniquement les tests E2E
REM   run-tests.bat performance  - Exécuter uniquement les tests de performance
REM   run-tests.bat security     - Exécuter uniquement les tests de sécurité
REM   run-tests.bat coverage     - Exécuter avec rapport de couverture
REM   run-tests.bat watch        - Exécuter en mode watch (re-exécute sur changements)

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║   🧪 Suite de Tests - Inscription par Téléphone               ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Vérifier si un argument est passé
if "%1"=="" (
    echo 📋 Exécution de TOUS les tests...
    echo.
    call npm test
    goto :end
)

if "%1"=="unit" (
    echo 📘 Exécution des tests UNITAIRES...
    echo.
    call npm test -- --testPathPattern=unit
    goto :end
)

if "%1"=="integration" (
    echo 📙 Exécution des tests d'INTÉGRATION...
    echo.
    call npm test -- --testPathPattern=integration
    goto :end
)

if "%1"=="e2e" (
    echo 📗 Exécution des tests END-TO-END...
    echo.
    call npm test -- --testPathPattern=e2e
    goto :end
)

if "%1"=="performance" (
    echo ⚡ Exécution des tests de PERFORMANCE...
    echo.
    call npm test -- --testPathPattern=performance
    goto :end
)

if "%1"=="security" (
    echo 🔒 Exécution des tests de SÉCURITÉ...
    echo.
    call npm test -- --testPathPattern=security
    goto :end
)

if "%1"=="coverage" (
    echo 📊 Exécution avec COUVERTURE DE CODE...
    echo.
    call npm run test:coverage
    echo.
    echo  Rapport de couverture généré dans coverage/lcov-report/index.html
    goto :end
)

if "%1"=="watch" (
    echo 👁️  Exécution en mode WATCH...
    echo.
    call npm test -- --watch
    goto :end
)

if "%1"=="ci" (
    echo 🤖 Exécution en mode CI...
    echo.
    call npm run test:ci
    goto :end
)

REM Argument non reconnu
echo Argument non reconnu: %1
echo.
echo Arguments valides:
echo   - unit         : Tests unitaires uniquement
echo   - integration  : Tests d'intégration uniquement
echo   - e2e          : Tests end-to-end uniquement
echo   - performance  : Tests de performance uniquement
echo   - security     : Tests de sécurité uniquement
echo   - coverage     : Tous les tests avec couverture de code
echo   - watch        : Mode watch (re-exécute sur changements)
echo   - ci           : Mode CI (intégration continue)
echo.

:end
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║   📊 Consultez les rapports dans test-reports/                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
