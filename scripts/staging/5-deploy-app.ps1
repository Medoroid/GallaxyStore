# Staging application deployment. Hosting is MANUAL; this script verifies guards
# and emits the exact checklist. It never deploys automatically.
. "$PSScriptRoot/lib/assert-safe-environment.ps1"

Assert-LocalMode -Context 'staging app deploy'
Assert-RequiredEnv -Names @('STAGING_APP_URL','NEXT_PUBLIC_SUPABASE_URL') -Context 'staging app deploy'

Write-Host 'STAGING APP DEPLOYMENT — MANUAL STEPS (automation intentionally absent):'
Write-Host "  1. Create a separate hosting project with URL: $env:STAGING_APP_URL"
Write-Host '  2. Configure env vars from .env.staging.example (staging values only).'
Write-Host '  3. Set SUPABASE_SERVICE_ROLE_KEY as a SERVER-ONLY secret.'
Write-Host '  4. Deploy the build artifact produced by 4-build.ps1.'
Write-Host '  5. Verify no production ref appears in deployment env/logs.'
Write-Host 'No external changes were made by this script.'
