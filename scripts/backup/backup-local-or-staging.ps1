# PHASE 3 PREPARATION — backup helper for LOCAL or STAGING only.
# Production backup requires explicit human approval and is intentionally NOT automated here.
param(
  [Parameter(Mandatory=$true)][ValidateSet('local','staging')][string]$Environment,
  [Parameter(Mandatory=$true)][string]$OutputDir
)
. "$PSScriptRoot/../staging/lib/assert-safe-environment.ps1"

if ($Environment -eq 'staging') { Assert-ExpectedStagingRef -Context 'staging backup' }
else { Assert-LocalMode -Context 'local backup' }

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMddHHmmss'

Write-Host "Backing up $Environment (never production) to $OutputDir"

# 1. Schema + data via Supabase CLI (uses linked staging or local DB).
if ($Environment -eq 'staging') {
  npx --no-install supabase db dump --linked -f "$OutputDir/schema-data-$stamp.sql"
} else {
  npx --no-install supabase db dump --local -f "$OutputDir/schema-data-$stamp.sql"
}
if ($LASTEXITCODE -ne 0) { throw 'Schema/data dump failed.' }

# 2. Roles/ACL snapshot (manual, no secrets printed):
Write-Host 'Roles/ACLs: capture via Supabase dashboard or pg_dumpall --roles-only on an authorized host.'

# 3. Storage inventory (read-only SQL):
Write-Host 'Storage inventory SQL: select id, public, file_size_limit from storage.buckets; select bucket_id, count(*) from storage.objects group by bucket_id;'

# 4. Integrity check:
$file = Get-Item "$OutputDir/schema-data-$stamp.sql"
if ($file.Length -lt 1024) { throw "BACKUP INVALID: $($file.Length) bytes. Do not proceed." }
Write-Host "BACKUP OK: $($file.Length) bytes (non-empty). Restore verification is a separate manual step."

# 5. Restore (isolated DB only), example:
Write-Host "Restore example: psql `<ISOLATED_DB_URL`> -f $OutputDir/schema-data-$stamp.sql"
