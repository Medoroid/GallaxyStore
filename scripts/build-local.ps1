# SAFE LOCAL BUILD — prevents accidentally baking Production URLs into the client bundle.
# .env.local points at Production; NEXT_PUBLIC_* are inlined at BUILD time.
# ALWAYS build Local with this script, not bare `npm run build`.
$ErrorActionPreference = 'Stop'

$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54121'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
$env:SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
$env:NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3100'
$env:NEXT_PUBLIC_BASE_URL = 'http://127.0.0.1:3100'

if ($env:NEXT_PUBLIC_SUPABASE_URL -match 'supabase\.co') {
  throw 'SAFETY ABORT: local build would target a remote Supabase project.'
}
Write-Host "Building for LOCAL Supabase: $env:NEXT_PUBLIC_SUPABASE_URL"
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Local build failed.' }
Write-Host 'Local build complete. Restart next start servers after rebuilding.'
