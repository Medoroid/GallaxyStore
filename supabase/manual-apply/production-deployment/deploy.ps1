# OPTIONAL CLI DEPLOYMENT RUNNER â€” NOT FOR USE UNTIL A HUMAN GRANTS APPROVAL.
# Default = dry run. Requires an authenticated Supabase CLI (SUPABASE_ACCESS_TOKEN)
# and a verified Staging deployment first. Never use service_role for DDL.

param(
  [switch]$ConfirmProduction,
  [switch]$SkipPrecheck
)

$ErrorActionPreference = 'Stop'
$project = 'httywgkwfqvrbuwuzutu'

# Ordered manifest â€” SQL Editor paste order is listed in MANIFEST.md.
$migrations = @(
  '20261028_payment_methods_external_wallet.sql',
  '20261029_order_payment_completion.sql',
  '20261030000002_confirm_order_payment_partial_index.sql',
  '20261030000003_order_status_cod_transitions.sql',
  '20261030000004_product_images_bucket.sql',
  '20261101_add_gift_box_product_type.sql',
  '20261108130000_site_content_banners_sections.sql',
  '20261110100000_theme_management.sql',
  '20261110120000_creator_studio_core.sql',
  '20261110160000_creator_studio_template_seed.sql',
  '20261110170000_creator_studio_publish_functions.sql',
  '20261112090000_fix_admin_product_performance.sql',
  '20261115120000_product_available_sizes_and_color_sync_guard.sql',
  '20261116130000_custom_print_studio.sql',
  '20261117130000_revoke_public_security_definer_execute.sql',
  '20261117140000_gift_box_bundles.sql',
  '20261117150000_fix_cancel_order_double_restock.sql',
  '20261117160000_vendor_payout_method.sql',
  '20261117170000_harden_financial_rls.sql',
  '20261118120000_fix_vendor_views_security_invoker.sql',
  # Production-applicable companion to the line above: after vendor views become
  # security_invoker, these two vendor-scoped SELECT policies keep vendor
  # dashboards showing their own store's orders. NOT local-only.
  '20261118130000_vendor_order_rls.sql',
  '20261118140000_unify_checkout_hardening_with_gift_boxes.sql'
)

Write-Host "DRY RUN: $($migrations.Count) migrations would be applied to $project in this order:"
$migrations | ForEach-Object { Write-Host "  $_" }
Write-Host "Precheck: supabase/manual-apply/production-deployment/01_PRECHECK.sql"
Write-Host "Postcheck: supabase/manual-apply/production-deployment/02_POSTCHECK.sql"

if (-not $ConfirmProduction) {
  Write-Host 'No production operation performed (missing -ConfirmProduction).'
  exit 0
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw 'SUPABASE_ACCESS_TOKEN is not set. Authenticate the CLI as a human first.'
}

foreach ($migration in $migrations) {
  $path = Join-Path 'supabase/migrations' $migration
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing migration: $path" }
  Write-Host "Applying $migration ..."
  npx --no-install supabase db query --project-ref $project --file $path
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $migration - STOP the batch." }
}

Write-Host 'All migrations applied. Run 02_POSTCHECK.sql and record output.'
