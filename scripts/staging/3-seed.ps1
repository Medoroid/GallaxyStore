# Staging seed deployment (STAGING-ONLY test data). Dry-run by default.
param([switch]$Execute)
. "$PSScriptRoot/lib/assert-safe-environment.ps1"

Assert-ExpectedStagingRef -Context 'staging seed'
$seed = 'supabase/seed.staging.sql'
if (-not (Test-Path -LiteralPath $seed)) { throw "Missing staging seed: $seed" }

if (-not $Execute) {
  Write-Host "DRY RUN: would apply $seed to the verified staging project."
  Write-Host 'This seed contains NO production customer data and NO credentials.'
  exit 0
}
$linked = Get-LinkedProjectRef
Assert-NotProductionRef -Ref $linked -Context 'staging seed (pre-write)'
Get-Content -LiteralPath $seed -Raw | npx --no-install supabase db query --linked --stdin
Write-Host 'Staging seed applied.'
