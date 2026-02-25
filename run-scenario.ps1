# PowerShell script to run scenarios
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('1','2','3','4')]
    [string]$Scenario
)

Write-Host "Starting Scenario $Scenario..." -ForegroundColor Cyan

switch ($Scenario) {
    '1' {
        Write-Host "Scenario 01: DB Only" -ForegroundColor Yellow
        $env:USE_REDIS = "false"
        $env:MAX_INFLIGHT = "1000"
        docker-compose up -d
        Start-Sleep -Seconds 30
        .\run-test.ps1 -TestType medium
    }
    '2' {
        Write-Host "Scenario 02: DB + Cache" -ForegroundColor Yellow
        $env:USE_REDIS = "true"
        $env:MAX_INFLIGHT = "1000"
        $env:CACHE_TTL = "30"
        docker-compose up -d
        Start-Sleep -Seconds 30
        .\run-test.ps1 -TestType medium
    }
    '3' {
        Write-Host "Scenario 03: Cache + Backpressure" -ForegroundColor Yellow
        $env:USE_REDIS = "true"
        $env:MAX_INFLIGHT = "300"
        $env:CACHE_TTL = "30"
        docker-compose up -d
        Start-Sleep -Seconds 30
        .\run-test.ps1 -TestType spike
    }
    '4' {
        Write-Host "Scenario 04: Horizontal Scaling" -ForegroundColor Yellow
        $env:USE_REDIS = "true"
        $env:MAX_INFLIGHT = "300"
        $env:CACHE_TTL = "30"
        docker-compose up -d --scale api=3
        Start-Sleep -Seconds 30
        .\run-test.ps1 -TestType spike
    }
}

Write-Host "`nScenario complete! Check the results above." -ForegroundColor Green
