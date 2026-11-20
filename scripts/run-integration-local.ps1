# Reproducible integration-test runner.
# Starts a dedicated Next server configured with the LOCAL Supabase stack so
# that both the test process and the API routes under test use the same DB.
# Keys are read from `supabase status` at runtime and never printed or stored.

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $env:TEMP 'galaxy-supabase-env.txt'
cmd /c "npx --no-install supabase status -o env > `"$envFile`" 2>nul"
$localEnv = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') {
    $value = $matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $localEnv[$matches[1]] = $value
  }
}
if (-not $localEnv.API_URL -or -not $localEnv.ANON_KEY -or -not $localEnv.SERVICE_ROLE_KEY) {
  throw 'Local Supabase is not running. Start it with: npx supabase start'
}

# Environment for both the test runner and the temporary Next server.
$env:SUPABASE_TEST_URL = $localEnv.API_URL
$env:SUPABASE_TEST_ANON_KEY = $localEnv.ANON_KEY
$env:TEST_SITE_URL = 'http://localhost:3102'
$env:NEXT_PUBLIC_SUPABASE_URL = $localEnv.API_URL
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $localEnv.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $localEnv.SERVICE_ROLE_KEY

# Stop any existing listener on the test port to keep runs deterministic.
$existing = netstat -ano | Select-String ':3102\s+.*LISTENING'
foreach ($line in $existing) {
  $pidValue = ($line.Line -split '\s+')[-1]
  if ($pidValue -match '^\d+$' -and $pidValue -ne '0') {
    Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
  }
}

# Stop the normal dev server on :3000 while the test server runs: Next 16
# refuses a second dev server in the same project directory.
$mainDevPids = @()
foreach ($line in (netstat -ano | Select-String ':3000\s+.*LISTENING')) {
  $v = ($line.Line -split '\s+')[-1]
  if ($v -match '^\d+$' -and $v -ne '0') { $mainDevPids += [int]$v }
}
foreach ($p in ($mainDevPids | Sort-Object -Unique)) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }

$server = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev','--','-p','3102') -PassThru `
  -RedirectStandardOutput "$env:TEMP\galaxy-testserver.log" `
  -RedirectStandardError "$env:TEMP\galaxy-testserver.err"
try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    try {
      $res = Invoke-WebRequest -Uri $env:TEST_SITE_URL -UseBasicParsing -TimeoutSec 3
      if ($res.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) { throw 'Test Next server did not become ready on port 3102' }
  Write-Host "Integration target: $([uri]$localEnv.API_URL).Host and $([uri]$localEnv.API_URL -replace '54121','3102')"
  # Write raw output via cmd so stderr/ANSI is not rewritten by PowerShell.
  cmd /c "npm run test:integration > `"$env:TEMP\galaxy-integration-final.txt`" 2>&1"
  Get-Content -LiteralPath "$env:TEMP\galaxy-integration-final.txt" -Tail 12
  $code = $LASTEXITCODE
} finally {
  # npm.cmd spawns a child node process; kill every listener on the test port.
  foreach ($line in (netstat -ano | Select-String ':3102\s+.*LISTENING')) {
    $p = ($line.Line -split '\s+')[-1]
    if ($p -match '^\d+$' -and $p -ne '0') { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue }
  }
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
  if ($mainDevPids.Count -gt 0) {
    Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev') | Out-Null
  }
}
exit $code
