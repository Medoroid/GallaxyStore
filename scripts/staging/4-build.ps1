# Staging application build. Uses staging env only; refuses production URL.
param([switch]$Execute)
. "$PSScriptRoot/lib/assert-safe-environment.ps1"

Assert-LocalMode -Context 'staging build'
Assert-RequiredEnv -Names @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY') -Context 'staging build'
$url = (Get-Item Env:NEXT_PUBLIC_SUPABASE_URL).Value
if ($url.Contains($script:PRODUCTION_PROJECT_REF)) {
  throw 'SAFETY ABORT: refusing to build with production Supabase URL.'
}
Write-Host "Building app for staging Supabase host: $([Uri]$url).Host"

if (-not $Execute) { Write-Host 'DRY RUN: npm run build'; exit 0 }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Staging build failed.' }
Write-Host 'Staging build complete.'
