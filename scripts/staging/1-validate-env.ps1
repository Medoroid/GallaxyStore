# Staging environment validation. SAFE: read-only checks, no writes.
param([switch]$Execute)
. "$PSScriptRoot/lib/assert-safe-environment.ps1"

Assert-ExpectedStagingRef -Context 'staging env validation'
Assert-RequiredEnv -Names @(
  'STAGING_PROJECT_REF','STAGING_APP_URL','NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_TEST_URL',
  'SUPABASE_TEST_ANON_KEY','TEST_SITE_URL'
) -Context 'staging env validation'

$url = (Get-Item Env:NEXT_PUBLIC_SUPABASE_URL).Value
if ($url.Contains($script:PRODUCTION_PROJECT_REF)) {
  throw 'SAFETY ABORT: NEXT_PUBLIC_SUPABASE_URL is production.'
}
$testUrl = (Get-Item Env:SUPABASE_TEST_URL).Value
if ($testUrl.Contains($script:PRODUCTION_PROJECT_REF)) {
  throw 'SAFETY ABORT: SUPABASE_TEST_URL is production.'
}
if ($url -ne $testUrl) {
  Write-Warning 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_TEST_URL differ; confirm both are staging.'
}
Write-Host "VALIDATION OK: staging app URL = $env:STAGING_APP_URL"
Write-Host 'All checks passed. No values printed.'
