@echo off
REM Correction temporaire de JAVA_HOME pour utiliser Java 17
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot
set PATH=%JAVA_HOME%\bin;%PATH%

echo JAVA_HOME corrigé vers: %JAVA_HOME%
echo.
echo Version de Java:
java -version
echo.
echo Execution de gradlew signingReport...
cd android
call gradlew signingReport
cd ..
