@echo off
REM Correction temporaire de JAVA_HOME pour la compilation Android
REM Utilisation du JBR (JetBrains Runtime) d'Android Studio - recommande pour le developpement Android
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
echo JAVA_HOME mis a jour vers: %JAVA_HOME%
echo.
echo Configuration mise a jour:
echo - Kotlin: 2.2.20
echo - compileSdk: 36
echo - targetSdk: 36
echo.
echo Nettoyage du cache Gradle...
cd android && gradlew clean --refresh-dependencies
echo.
echo Rebuild du projet...
cd android && gradlew build --refresh-dependencies
