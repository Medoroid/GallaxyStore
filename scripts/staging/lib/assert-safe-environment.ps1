# =============================================================================
# PHASE 2.1 — SHARED PRODUCTION ISOLATION GUARD
# Dot-source this module from every staging/backup script BEFORE any operation.
# It never prints secret values and exits immediately on failed safety checks.
# =============================================================================

$ErrorActionPreference = 'Stop'

# The one and only production reference. Never target it from staging scripts.
$script:PRODUCTION_PROJECT_REF = 'httywgkwfqvrbuwuzutu'

function Get-LinkedProjectRef {
  $path = Join-Path (Get-Location) 'supabase/.temp/project-ref'
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Cannot determine linked Supabase project: $path is missing."
  }
  return (Get-Content -LiteralPath $path -Raw).Trim()
}

function Assert-NotProductionRef {
  param([Parameter(Mandatory = $true)][string]$Ref, [string]$Context = 'operation')
  if ($Ref -eq $script:PRODUCTION_PROJECT_REF) {
    throw "SAFETY ABORT [$Context]: linked project ref '$Ref' is PRODUCTION. Refusing to continue."
  }
}

function Assert-ExpectedStagingRef {
  param([string]$Context = 'staging operation')
  $expected = (Get-Item Env:STAGING_PROJECT_REF -ErrorAction SilentlyContinue).Value
  if (-not $expected) {
    throw "SAFETY ABORT [$Context]: STAGING_PROJECT_REF is not set."
  }
  Assert-NotProductionRef -Ref $expected -Context "$Context (STAGING_PROJECT_REF env)"
  $actual = Get-LinkedProjectRef
  Assert-NotProductionRef -Ref $actual -Context "$Context (CLI link)"
  if ($actual -ne $expected) {
    throw "SAFETY ABORT [$Context]: CLI is linked to '$actual', expected staging '$expected'. Run the documented switch procedure first."
  }
  Write-Host "GUARD OK [$Context]: staging ref '$actual' verified (production ref rejected)."
}

function Assert-RequiredEnv {
  param([string[]]$Names, [string]$Context = 'operation')
  $missing = @()
  foreach ($name in $Names) {
    $value = (Get-Item Env:$name -ErrorAction SilentlyContinue).Value
    if (-not $value -or $value -match '^<.*>$') { $missing += $name }
  }
  if ($missing.Count -gt 0) {
    throw "SAFETY ABORT [$Context]: missing/placeholder env vars: $($missing -join ', '). Values are never printed."
  }
  Write-Host "GUARD OK [$Context]: all $($Names.Count) required variables are set (values hidden)."
}

function Assert-LocalMode {
  # Local commands must never be given a --project-ref or remote URL.
  param([string]$Context = 'local operation')
  $url = (Get-Item Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue).Value
  if ($url -and $url.Contains($script:PRODUCTION_PROJECT_REF)) {
    throw "SAFETY ABORT [$Context]: NEXT_PUBLIC_SUPABASE_URL points at PRODUCTION."
  }
  Write-Host "GUARD OK [$Context]: no production URL detected."
}
