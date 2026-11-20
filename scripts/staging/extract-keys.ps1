$ErrorActionPreference = 'Stop'
$raw = Get-Content -LiteralPath "C:\Users\medo\AppData\Local\Temp\opencode\staging-api-keys.json" -Raw
$start = $raw.LastIndexOf('[')
$end = $raw.LastIndexOf(']')
if ($start -lt 0 -or $end -le $start) { throw 'No JSON array in keys file' }
$json = $raw.Substring($start, $end - $start + 1)
$keys = $json | ConvertFrom-Json
$anon = ($keys | Where-Object { $_.name -eq 'anon' -and $_.type -eq 'legacy' }).api_key
$service = ($keys | Where-Object { $_.name -eq 'service_role' -and $_.type -eq 'legacy' }).api_key
if (-not $anon -or -not $service) { throw 'Missing legacy anon/service keys' }
$anon | Set-Content -LiteralPath "C:\Users\medo\AppData\Local\Temp\opencode\staging-anon.txt" -NoNewline
$service | Set-Content -LiteralPath "C:\Users\medo\AppData\Local\Temp\opencode\staging-service.txt" -NoNewline
"Extracted keys to local temp files (values hidden). anon length=$($anon.Length), service length=$($service.Length)"
