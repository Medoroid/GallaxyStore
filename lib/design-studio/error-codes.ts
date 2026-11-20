/**
 * Server error codes the studio UI has translated messages for.
 * Pure (no i18n) so both the grid page and the editor can share it; the
 * pages map a matched code to `studio_err_<code>` via their own `t`.
 */

export const MAPPED_ERROR_CODES = [
  "missing_file",
  "too_large",
  "svg_too_large",
  "unsupported_type",
  "invalid_file",
  "too_small_dimensions",
  "too_large_dimensions",
  "not_svg",
  "storage_rejected",
  "invalid_title",
  "invalid_editor_state",
  "field_not_allowed",
  "not_found",
  // Phase 5 — mockups endpoint
  "invalid_config",
  "no_artwork",
  "stale_artwork",
  "templates_not_seeded",
  "creator_profile_required",
  // Phase 6 — product configuration
  "invalid_body",
  "not_an_object",
  "empty_patch",
  "invalid_template",
  "invalid_colors",
  "invalid_sizes",
  "invalid_view_states",
  "template_inactive",
  // Phase 7 — publishing + approval
  "invalid_target",
  "invalid_product_id",
  "invalid_name",
  "invalid_price",
  "invalid_description",
  "invalid_category",
  "invalid_tags",
  "invalid_visibility",
  "invalid_preview_path",
  "invalid_status",
  "no_mockups",
  "already_submitted",
  "already_published",
  "publish_disabled",
  "design_archived",
  "product_linked",
] as const;

export type MappedErrorCode = (typeof MAPPED_ERROR_CODES)[number];

export function isMappedErrorCode(
  code: string | undefined | null
): code is MappedErrorCode {
  return (
    typeof code === "string" &&
    (MAPPED_ERROR_CODES as readonly string[]).includes(code)
  );
}
