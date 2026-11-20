# Enable Google OAuth on the LINKED Supabase Staging project.
# Reads credentials from environment (owner supplies STAGING-specific values).
# Never prints values. Never uses Production credentials.
$ErrorActionPreference = 'Stop'

$linked = (Get-Content -LiteralPath "supabase/.temp/project-ref" -Raw).Trim()
if ($linked -eq 'httywgkwfqvrbuwuzutu') {
  throw 'SAFETY ABORT: linked project is PRODUCTION. Refusing to push auth config.'
}
if (-not $env:GOOGLE_CLIENT_ID -or -not $env:GOOGLE_CLIENT_SECRET) {
  throw 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be supplied in the environment (staging client). Values are never printed.'
}
Write-Host "Pushing auth config to linked Staging project: $linked"
npx --yes supabase@latest config push --yes
if ($LASTEXITCODE -ne 0) { throw 'config push failed.' }
Write-Host 'Google provider config pushed. Next: register this callback in Google Cloud Console:'
Write-Host "https://$linked.supabase.co/auth/v1/callback"
