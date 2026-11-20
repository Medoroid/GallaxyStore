# Staging database migration deployment. Dry-run by default.
param([switch]$Execute)
. "$PSScriptRoot/lib/assert-safe-environment.ps1"

Assert-ExpectedStagingRef -Context 'staging DB deploy'
if (-not $Execute) {
  Write-Host 'DRY RUN: would inspect remote schema_migrations, then apply ONLY missing migrations in version order.'
  Write-Host 'Intended set: all 53 timestamped supabase/migrations/*.sql (7 legacy create_*.sql are skipped).'
  Write-Host 'Re-run with -Execute after verification.'
  exit 0
}

# Verify the remote project identity one final time before any write.
$linked = Get-LinkedProjectRef
Assert-NotProductionRef -Ref $linked -Context 'staging DB deploy (pre-write)'

# Inspect remote history first; never blindly replay historical migrations.
Write-Host 'Inspecting remote schema_migrations ...'
npx --no-install supabase db remote list

# Apply pending migrations to the LINKED (verified staging) project only.
npx --no-install supabase db push --linked
if ($LASTEXITCODE -ne 0) { throw 'supabase db push failed. Stop and investigate.' }

Write-Host 'Staging DB push complete. Run 02_POSTCHECK.sql and template checks next.'
