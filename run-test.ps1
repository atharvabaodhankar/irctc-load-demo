# PowerShell script to run K6 load tests
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('light','medium','spike')]
    [string]$TestType
)

$scriptPath = "load-tests/tatkal-$TestType.js"

Write-Host "Running $TestType load test..." -ForegroundColor Green
docker run --rm -v ${PWD}/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-$TestType.js
