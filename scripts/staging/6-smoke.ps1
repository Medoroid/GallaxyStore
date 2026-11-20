# Staging smoke tests. Requires a deployed staging app URL.
. "$PSScriptRoot/lib/assert-safe-environment.ps1"

Assert-LocalMode -Context 'staging smoke'
Assert-RequiredEnv -Names @('STAGING_APP_URL','NEXT_PUBLIC_SUPABASE_URL') -Context 'staging smoke'
$base = $env:STAGING_APP_URL.TrimEnd('/')

$paths = @('/', '/products', '/login', '/gift-boxes', '/api/templates')
$failed = $false
foreach ($path in $paths) {
  try {
    $res = Invoke-WebRequest -Uri "$base$path" -TimeoutSec 20 -UseBasicParsing
    Write-Host "  $path => $($res.StatusCode)"
    if ($res.StatusCode -ge 500) { $failed = $true }
  } catch {
    Write-Host "  $path => ERROR: $($_.Exception.Message)"
    $failed = $true
  }
}
if ($failed) { throw 'Staging smoke tests failed.' }
Write-Host 'Staging smoke tests passed.'
