# Runs the FULL Playwright suite against a Next server backed by the isolated
# local Supabase stack. Keys are read from `supabase status` at runtime and are
# never printed or stored in the repository.

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
if (-not $localEnv.API_URL -or -not $localEnv.ANON_KEY) { throw 'Local Supabase is not running.' }

$env:NEXT_PUBLIC_SUPABASE_URL = $localEnv.API_URL
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $localEnv.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $localEnv.SERVICE_ROLE_KEY
$baseUrl = 'http://localhost:3103'

# Free the port and stop the regular dev server (Next 16 allows only one dev
# server per project directory).
foreach ($port in @(3103, 3000)) {
  foreach ($line in (netstat -ano | Select-String ":$port\s+.*LISTENING")) {
    $p = ($line.Line -split '\s+')[-1]
    if ($p -match '^\d+$' -and $p -ne '0') { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue }
  }
}

# Temporary Playwright config inside the repo so testDir/module resolution work.
$cfg = Join-Path (Get-Location) 'playwright.local.config.ts'
@'
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3103",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
'@ | Set-Content -LiteralPath $cfg -Encoding UTF8

$server = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev','--','-p','3103') -PassThru `
  -RedirectStandardOutput "$env:TEMP\galaxy-e2e-server.log" `
  -RedirectStandardError "$env:TEMP\galaxy-e2e-server.err"
try {
  $ready = $false
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    try {
      if ((Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) { throw 'Local E2E server did not become ready on :3103' }
  cmd /c "npx playwright test --config=playwright.local.config.ts > `"$env:TEMP\galaxy-e2e-local.txt`" 2>&1"
  Get-Content -LiteralPath "$env:TEMP\galaxy-e2e-local.txt" -Tail 14
  $code = $LASTEXITCODE
} finally {
  foreach ($line in (netstat -ano | Select-String ':3103\s+.*LISTENING')) {
    $p = ($line.Line -split '\s+')[-1]
    if ($p -match '^\d+$' -and $p -ne '0') { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue }
  }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $cfg -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev') | Out-Null
}
exit $code
