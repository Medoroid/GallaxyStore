# Staging Playwright execution. Refuses production; uses staged config.
. "$PSScriptRoot/lib/assert-safe-environment.ps1"

Assert-LocalMode -Context 'staging E2E'
Assert-RequiredEnv -Names @('STAGING_APP_URL','SUPABASE_TEST_URL','SUPABASE_TEST_ANON_KEY') -Context 'staging E2E'
foreach ($name in @('STAGING_APP_URL','SUPABASE_TEST_URL')) {
  if ((Get-Item Env:$name).Value.Contains($script:PRODUCTION_PROJECT_REF)) {
    throw "SAFETY ABORT: $name points at production."
  }
}
Write-Host 'Running Staging Playwright suite (production URLs refused by config)...'
npx playwright test --config playwright.staging.config.ts
if ($LASTEXITCODE -ne 0) { throw 'Staging E2E failed.' }
Write-Host 'Staging E2E complete.'
