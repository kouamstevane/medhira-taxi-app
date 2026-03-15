@echo off
echo ========================================
echo   Tests Suite - Phone Registration
echo ========================================
echo.

echo [1/3] Running Integration Tests...
echo ----------------------------------------
call npm test -- src/__tests__/integration/phone-registration.test.tsx --no-coverage --colors
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Integration tests FAILED
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo  Integration tests PASSED
echo.

echo [2/3] Running E2E Tests...
echo ----------------------------------------
call npm test -- src/__tests__/e2e/e2e-flow.test.tsx --no-coverage --colors
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo E2E tests FAILED
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo  E2E tests PASSED
echo.

echo [3/3] Running All Tests with Coverage...
echo ----------------------------------------
call npm test -- src/__tests__/ --coverage --colors
if %ERRORLEVEL% NEQ 0 (
   echo.
    echo Full test suite FAILED
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================
echo      ALL TESTS PASSED! 
echo ========================================
echo.
echo Coverage report generated at:
echo   coverage/lcov-report/index.html
echo.
pause
