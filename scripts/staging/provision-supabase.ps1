# Provision Supabase Staging (run ONLY after owner approval)
# Generates a DB password locally, never prints it, never stores it in the repo.
# Usage: powershell -File scripts/staging/provision-supabase.ps1
$ErrorActionPreference = 'Stop'
$passwordFile = "C:\Users\medo\AppData\Local\Temp\opencode\staging-db-password.txt"

if (-not (Test-Path -LiteralPath $passwordFile)) {
  $bytes = 1..24 | ForEach-Object { Get-Random -Max 256 }
  ([System.Convert]::ToBase64String($bytes) + 'Aa1!').Substring(0,32) |
    Set-Content -LiteralPath $passwordFile -NoNewline
}
$dbPassword = Get-Content -LiteralPath $passwordFile -Raw
$env:SUPABASE_DB_PASSWORD = $dbPassword

# Create the independent free/micro Staging project in the owner's org.
npx --yes supabase@latest projects create gallaxy-store-staging `
  --org-id nufiqypilaairmozaxty `
  --db-password $dbPassword `
  --region us-west-1 `
  --yes --output json

Write-Host 'Project created. Next: capture the ref from output, verify it is NOT httywgkwfqvrbuwuzutu.'
Write-Host 'Then run: npx supabase projects api-keys --project-ref <NEW_REF> --output json'
Write-Host 'Store keys ONLY in Vercel env / local temp files. Never in Git or chat.'
