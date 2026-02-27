# Script PowerShell pour tuer les processus qui bloquent les ports Firebase
# Utilisation: .\kill-firebase-ports.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Nettoyage des ports Firebase..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ports Firebase à vérifier
$ports = @{
    "Firestore" = 8080
    "Auth" = 9099
    "Functions" = 5001
    "Hosting" = 5000
    "Storage" = 9199
    "UI" = 4000
}

foreach ($service in $ports.Keys) {
    $port = $ports[$service]
    
    Write-Host "Vérification du port $port ($service)..." -ForegroundColor Yellow
    
    try {
        # Trouver les processus sur ce port
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
        
        if ($connections) {
            foreach ($conn in $connections) {
                $pid = $conn.OwningProcess
                
                try {
                    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    $processName = $process.ProcessName
                    Write-Host "  Processus trouvé: $processName (PID: $pid)" -ForegroundColor Red
                    
                    # Tuer le processus
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    Write-Host "  Processus $pid terminé avec succès" -ForegroundColor Green
                }
                catch {
                    Write-Host "  Impossible de tuer le processus $pid" -ForegroundColor Red
                }
            }
        }
        else {
            Write-Host "  Port $port libre" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  Erreur lors de la vérification du port $port" -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Nettoyage terminé!" -ForegroundColor Green
Write-Host "Vous pouvez maintenant lancer: firebase emulators:start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
