export type Locale = "en" | "ar";

export const locales: Locale[] = ["en", "ar"];

export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};

export const dir: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
};

type TranslationKeys = {
  // Navigation
  nav_home: string;
  nav_products: string;
  nav_custom_print: string;
  nav_gallery: string;
  nav_designs: string;
  nav_gift_boxes: string;
  nav_creators: string;
  nav_cart: string;
  nav_wishlist: string;
  nav_orders: string;
  nav_admin: string;
  nav_login: string;
  nav_register: string;
  nav_logout: string;

  // Home
  home_title: string;
  home_subtitle: string;
  home_cta: string;

  // Products
  products_title: string;
  products_subtitle: string;
  products_search: string;
  products_filters: string;
  products_all: string;
  products_sort: string;
  products_price_range: string;
  products_min_rating: string;
  products_no_results: string;
  products_per_page: string;

  // Product Details
  product_add_to_cart: string;
  product_buy_now: string;
  product_description: string;
  product_specs: string;
  product_images: string;
  product_reviews: string;
  product_related: string;
  product_color: string;
  product_size: string;
  product_quantity: string;

  // Cart
  cart_title: string;
  cart_empty: string;
  cart_continue_shopping: string;
  cart_clear: string;
  cart_summary: string;
  cart_subtotal: string;
  cart_shipping: string;
  cart_free: string;
  cart_discount: string;
  cart_total: string;
  cart_checkout: string;
  cart_promo_code: string;
  cart_apply: string;

  // Checkout
  checkout_title: string;
  checkout_address: string;
  checkout_payment: string;
  checkout_confirm: string;
  checkout_full_name: string;
  checkout_phone: string;
  checkout_street: string;
  checkout_city: string;
  checkout_state: string;
  checkout_zip: string;
  checkout_country: string;
  checkout_notes: string;
  checkout_continue: string;
  checkout_place_order: string;
  checkout_cash_on_delivery: string;
  checkout_card: string;
  checkout_success: string;
  checkout_cancelled: string;

  // Auth
  login_title: string;
  login_email: string;
  login_password: string;
  login_submit: string;
  login_register_link: string;
  register_title: string;
  register_name: string;
  register_email: string;
  register_password: string;
  register_confirm_password: string;
  register_submit: string;
  register_login_link: string;

  // Orders
  orders_title: string;
  orders_empty: string;
  orders_id: string;
  orders_date: string;
  orders_status: string;
  orders_total: string;

  // Wishlist
  wishlist_title: string;
  wishlist_empty: string;
  wishlist_view_product: string;

  // Gallery
  gallery_title: string;
  gallery_subtitle: string;

  // Gift Boxes
  gift_boxes_title: string;
  gift_boxes_subtitle: string;
  gift_boxes_custom: string;
  gift_boxes_request: string;

  // Custom Print
  custom_print_title: string;
  custom_print_subtitle: string;
  custom_print_choose_product: string;
  custom_print_upload: string;
  custom_print_text: string;
  custom_print_size: string;
  custom_print_color: string;
  custom_print_notes: string;

  // Common
  common_loading: string;
  common_error: string;
  common_save: string;
  common_cancel: string;
  common_delete: string;
  common_edit: string;
  common_back: string;
  common_next: string;
  common_previous: string;
  common_view_all: string;
  common_learn_more: string;
  common_retry: string;

  // Creator Studio (dashboard + public profile)
  creator_dashboard: string;
  creator_login_required: string;
  creator_overview: string;
  creator_tab_designs: string;
  creator_tab_products: string;
  creator_tab_gallery: string;
  creator_tab_drafts: string;
  creator_tab_pending: string;
  creator_tab_rejected: string;
  creator_tab_settings: string;
  creator_stat_designs: string;
  creator_stat_published_products: string;
  creator_stat_gallery: string;
  creator_stat_pending: string;
  creator_no_profile_title: string;
  creator_no_profile_body: string;
  creator_create_profile: string;
  creator_username: string;
  creator_username_hint: string;
  creator_display_name: string;
  creator_bio: string;
  creator_social_links: string;
  creator_profile_saved: string;
  creator_view_public_profile: string;
  creator_public_profile: string;
  creator_products_count: string;
  creator_gallery_count: string;
  creator_designs_count: string;
  creator_joined: string;
  creator_featured: string;
  creator_empty_designs: string;
  creator_empty_products: string;
  creator_empty_gallery: string;
  creator_empty_section: string;
  creator_visit_profile: string;
  creators_eyebrow: string;
  creators_heading: string;
  creators_intro: string;
  creators_empty_title: string;
  creators_empty: string;
  creators_latest_title: string;
  creators_latest_empty: string;
  creators_unavailable_title: string;
  creators_unavailable: string;
  status_draft: string;
  status_pending_review: string;
  status_approved: string;
  status_published: string;
  status_rejected: string;
  status_archived: string;
  creator_rejection_feedback: string;
  creator_not_found: string;
  creator_publishing_disabled: string;
  creator_unsaved_changes: string;
  studio_title: string;
  studio_subtitle: string;
  studio_my_designs: string;
  studio_new_design: string;
  studio_open_editor: string;
  studio_empty_title: string;
  studio_empty_body: string;
  studio_load_error: string;
  studio_page: string;
  studio_upload_hint: string;
  studio_upload_formats: string;
  studio_upload_title: string;
  studio_design_title: string;
  studio_design_title_ph: string;
  studio_create: string;
  studio_creating: string;
  studio_file_selected: string;
  studio_warnings: string;
  studio_replace_artwork: string;
  studio_replace_hint: string;
  studio_back_to_designs: string;
  studio_loading_editor: string;
  studio_no_artwork: string;
  studio_artwork: string;
  studio_artwork_props: string;
  studio_dimensions_px: string;
  studio_format: string;
  studio_transparency: string;
  studio_transparency_yes: string;
  studio_transparency_no: string;
  studio_transparency_unknown: string;
  studio_file_dpi: string;
  studio_design_details: string;
  studio_description: string;
  studio_description_ph: string;
  studio_placement: string;
  studio_pos_x: string;
  studio_pos_y: string;
  studio_width: string;
  studio_height: string;
  studio_inches: string;
  studio_rotation: string;
  studio_aspect_lock: string;
  studio_align: string;
  studio_align_left: string;
  studio_align_hcenter: string;
  studio_align_right: string;
  studio_align_top: string;
  studio_align_vcenter: string;
  studio_align_bottom: string;
  studio_reset_placement: string;
  studio_fit_area: string;
  studio_zoom: string;
  studio_zoom_in: string;
  studio_zoom_out: string;
  studio_zoom_fit: string;
  studio_undo: string;
  studio_redo: string;
  studio_printable_area: string;
  studio_hint_drag: string;
  studio_save_now: string;
  studio_saving: string;
  studio_saved: string;
  studio_unsaved: string;
  studio_save_failed: string;
  studio_effective_dpi: string;
  studio_dpi: string;
  studio_rename: string;
  studio_rename_title: string;
  studio_delete_title: string;
  studio_delete_body: string;
  studio_deleted: string;
  studio_panel_artwork: string;
  studio_panel_controls: string;
  studio_err_missing_file: string;
  studio_err_title_required: string;
  studio_err_too_large: string;
  studio_err_svg_too_large: string;
  studio_err_unsupported_type: string;
  studio_err_invalid_file: string;
  studio_err_too_small_dimensions: string;
  studio_err_too_large_dimensions: string;
  studio_err_not_svg: string;
  studio_err_storage_rejected: string;
  studio_err_invalid_editor_state: string;
  studio_err_field_not_allowed: string;
  studio_err_not_found: string;
  studio_err_network: string;
  studio_err_generic: string;
  studio_warn_low_resolution: string;
  studio_warn_mime_mismatch: string;
  studio_warn_overflow: string;
  studio_warn_dpi: string;
  // Phase 5 — mockups endpoint errors
  studio_err_invalid_config: string;
  studio_err_no_artwork: string;
  studio_err_stale_artwork: string;
  studio_err_templates_not_seeded: string;
  studio_err_creator_profile_required: string;
  // Phase 6 — product configuration errors
  studio_err_invalid_body: string;
  studio_err_not_an_object: string;
  studio_err_empty_patch: string;
  studio_err_invalid_template: string;
  studio_err_invalid_colors: string;
  studio_err_invalid_sizes: string;
  studio_err_invalid_view_states: string;
  studio_err_template_inactive: string;
  // Phase 6 — product catalog & configuration
  product_catalog_title: string;
  product_catalog_hint: string;
  product_add: string;
  product_adding: string;
  product_added: string;
  product_configure: string;
  product_hide: string;
  product_empty: string;
  product_load_error: string;
  product_need_artwork: string;
  product_colors: string;
  product_sizes: string;
  product_select_color_hint: string;
  product_placement: string;
  product_placement_hint: string;
  product_offset_x: string;
  product_offset_y: string;
  product_scale: string;
  product_rotation: string;
  product_placement_reset: string;
  product_saving: string;
  product_mockups: string;
  product_mockup_generating: string;
  product_mockup_pending: string;
  product_mockup_failed: string;
  product_mockup_retry: string;
  product_delete: string;
  product_delete_title: string;
  product_delete_body: string;
  product_fulfillment_unconfigured: string;
  product_fulfillment_configured: string;
  product_cat_apparel: string;
  product_cat_drinkware: string;
  product_cat_tech: string;
  product_cat_accessories: string;
  product_cat_wall_art: string;
  product_view_front: string;
  product_view_back: string;
  product_view_top: string;
  // Phase 7 — publishing & approval (16 new codes + the pre-existing
  // invalid_title gap, which had no key)
  studio_err_invalid_title: string;
  studio_err_invalid_target: string;
  studio_err_invalid_product_id: string;
  studio_err_invalid_name: string;
  studio_err_invalid_price: string;
  studio_err_invalid_description: string;
  studio_err_invalid_category: string;
  studio_err_invalid_tags: string;
  studio_err_invalid_visibility: string;
  studio_err_invalid_preview_path: string;
  studio_err_invalid_status: string;
  studio_err_no_mockups: string;
  studio_err_already_submitted: string;
  studio_err_already_published: string;
  studio_err_publish_disabled: string;
  studio_err_design_archived: string;
  studio_err_product_linked: string;
  publish_button: string;
  publish_title: string;
  publish_target: string;
  publish_target_product: string;
  publish_target_product_hint: string;
  publish_target_gallery: string;
  publish_target_gallery_hint: string;
  publish_product_row: string;
  publish_no_products: string;
  publish_no_publishable_products: string;
  publish_need_previews: string;
  publish_name: string;
  publish_gallery_title: string;
  publish_price: string;
  publish_description: string;
  publish_short_description: string;
  publish_category: string;
  publish_category_none: string;
  publish_tags: string;
  publish_tags_hint: string;
  publish_visibility: string;
  publish_visibility_public: string;
  publish_visibility_unlisted: string;
  publish_preview_note: string;
  publish_fulfillment_notice: string;
  publish_submitting: string;
  publish_submit_product: string;
  publish_submit_gallery: string;
  publish_success_product: string;
  publish_success_gallery: string;
  publish_success_note: string;
  publish_done: string;
  attribution_designed_by: string;
  attribution_more_by: string;
  attribution_visit_profile: string;
  // Gift Boxes (product-based bundles)
  gift_box_contents_title: string;
  gift_box_contents_value: string;
  gift_box_savings: string;
  gift_box_out_of_stock: string;
  gift_box_hidden_notice: string;
  gift_box_empty: string;
  gift_box_load_error: string;
  gift_box_order_contents: string;
  gift_boxes_empty: string;
  gift_boxes_load_error: string;
  gift_boxes_loading: string;
  gift_box_items_count: string;
  gift_box_view_product: string;
  gift_box_retry: string;
  // Customer Custom Print Studio
  cp_eyebrow: string;
  cp_title_a: string;
  cp_title_b: string;
  cp_title_c: string;
  cp_subtitle: string;
  cp_signin: string;
  cp_live_mockup: string;
  cp_photo_ready: string;
  cp_photo_loading: string;
  cp_photo_error: string;
  cp_preview_empty: string;
  cp_drag_hint: string;
  cp_undo: string;
  cp_redo: string;
  cp_center: string;
  cp_reset: string;
  cp_rotate15: string;
  cp_print_check: string;
  cp_panel_product: string;
  cp_panel_options: string;
  cp_panel_upload: string;
  cp_panel_placement: string;
  cp_panel_order: string;
  cp_design_title: string;
  cp_design_title_ph: string;
  cp_quantity: string;
  cp_upload_hint: string;
  cp_upload_formats: string;
  cp_dpi_source: string;
  cp_transparency: string;
  cp_yes: string;
  cp_no: string;
  cp_size: string;
  cp_rotation: string;
  cp_horizontal: string;
  cp_vertical: string;
  cp_share_title: string;
  cp_share_hint: string;
  cp_save_private: string;
  cp_add_cart: string;
  cp_notice_private: string;
  cp_notice_shared: string;
  cp_warn_overflow: string;
  cp_warn_lowres: string;
  cp_warn_dpi: string;
  cp_warn_transparency: string;
};

const en: TranslationKeys = {
  // Navigation
  nav_home: "Home",
  nav_products: "Products",
  nav_custom_print: "Custom Print",
  nav_gallery: "Gallery",
  nav_designs: "Designs",
  nav_gift_boxes: "Gift Boxes",
  nav_creators: "Creators",
  nav_cart: "Cart",
  nav_wishlist: "Wishlist",
  nav_orders: "My Orders",
  nav_admin: "Admin",
  nav_login: "Login",
  nav_register: "Register",
  nav_logout: "Sign Out",

  // Home
  home_title: "Galaxy Store",
  home_subtitle: "Premium custom prints & gaming gear",
  home_cta: "Shop Now",

  // Products
  products_title: "All Products",
  products_subtitle: "Premium custom prints, gaming-themed gear and cosmic gifts.",
  products_search: "Search products...",
  products_filters: "Filters",
  products_all: "All",
  products_sort: "Sort By",
  products_price_range: "Price Range",
  products_min_rating: "Minimum Rating",
  products_no_results: "No products match your filters.",
  products_per_page: "per page",

  // Product Details
  product_add_to_cart: "Add to Cart",
  product_buy_now: "Buy Now",
  product_description: "Description",
  product_specs: "Specifications",
  product_images: "Images",
  product_reviews: "Reviews",
  product_related: "Related Products",
  product_color: "Color",
  product_size: "Size",
  product_quantity: "Quantity",

  // Cart
  cart_title: "Shopping Cart",
  cart_empty: "Your cart is empty",
  cart_continue_shopping: "Continue Shopping",
  cart_clear: "Clear Cart",
  cart_summary: "Order Summary",
  cart_subtotal: "Subtotal",
  cart_shipping: "Shipping",
  cart_free: "Free",
  cart_discount: "Discount",
  cart_total: "Total",
  cart_checkout: "Checkout",
  cart_promo_code: "Promo Code",
  cart_apply: "Apply",

  // Checkout
  checkout_title: "Checkout",
  checkout_address: "Shipping Address",
  checkout_payment: "Payment Method",
  checkout_confirm: "Confirm Order",
  checkout_full_name: "Full Name",
  checkout_phone: "Phone",
  checkout_street: "Street Address",
  checkout_city: "City",
  checkout_state: "State",
  checkout_zip: "ZIP Code",
  checkout_country: "Country",
  checkout_notes: "Order Notes",
  checkout_continue: "Continue",
  checkout_place_order: "Place Order",
  checkout_cash_on_delivery: "Cash on Delivery",
  checkout_card: "Credit/Debit Card",
  checkout_success: "Payment Successful!",
  checkout_cancelled: "Payment Cancelled",

  // Auth
  login_title: "Sign In",
  login_email: "Email",
  login_password: "Password",
  login_submit: "Sign In",
  login_register_link: "Don't have an account? Register",
  register_title: "Create Account",
  register_name: "Full Name",
  register_email: "Email",
  register_password: "Password",
  register_confirm_password: "Confirm Password",
  register_submit: "Create Account",
  register_login_link: "Already have an account? Sign In",

  // Orders
  orders_title: "My Orders",
  orders_empty: "No orders yet",
  orders_id: "Order ID",
  orders_date: "Date",
  orders_status: "Status",
  orders_total: "Total",

  // Wishlist
  wishlist_title: "My Wishlist",
  wishlist_empty: "Your wishlist is empty",
  wishlist_view_product: "View Product",

  // Gallery
  gallery_title: "Gallery",
  gallery_subtitle: "Explore our collection of custom designs and creative works.",

  // Gift Boxes
  gift_boxes_title: "Gift Boxes",
  gift_boxes_subtitle: "Curated gift boxes for every occasion.",
  gift_boxes_custom: "Need a fully custom box?",
  gift_boxes_request: "Request Custom Box",

  // Custom Print
  custom_print_title: "Custom Print Studio",
  custom_print_subtitle: "Design your own custom prints.",
  custom_print_choose_product: "Choose Product",
  custom_print_upload: "Upload Image",
  custom_print_text: "Custom Text",
  custom_print_size: "Size",
  custom_print_color: "Color",
  custom_print_notes: "Notes",

  // Common
  common_loading: "Loading...",
  common_error: "Error",
  common_save: "Save",
  common_cancel: "Cancel",
  common_delete: "Delete",
  common_edit: "Edit",
  common_back: "Back",
  common_next: "Next",
  common_previous: "Previous",
  common_view_all: "View All",
  common_learn_more: "Learn More",
  common_retry: "Try Again",

  // Creator Studio (dashboard + public profile)
  creator_dashboard: "Creator Dashboard",
  creator_login_required: "Sign in to open your creator dashboard.",
  creator_overview: "Overview",
  creator_tab_designs: "My Designs",
  creator_tab_products: "My Products",
  creator_tab_gallery: "My Gallery",
  creator_tab_drafts: "Drafts",
  creator_tab_pending: "Pending Review",
  creator_tab_rejected: "Rejected",
  creator_tab_settings: "Settings",
  creator_stat_designs: "Designs",
  creator_stat_published_products: "Published Products",
  creator_stat_gallery: "Gallery Entries",
  creator_stat_pending: "Pending Review",
  creator_no_profile_title: "Claim your creator identity",
  creator_no_profile_body:
    "Choose a public username to open your creator profile. You can publish designs and products once it exists.",
  creator_create_profile: "Create profile",
  creator_username: "Username",
  creator_username_hint: "3-30 characters: letters, numbers and underscores",
  creator_display_name: "Display name",
  creator_bio: "Bio",
  creator_social_links: "Social links",
  creator_profile_saved: "Profile saved",
  creator_view_public_profile: "View public profile",
  creator_public_profile: "Public profile",
  creator_products_count: "Products",
  creator_gallery_count: "Gallery",
  creator_designs_count: "Designs",
  creator_joined: "Joined",
  creator_featured: "Featured",
  creator_empty_designs: "No designs yet. Open the Design Studio to upload your first artwork.",
  creator_empty_products:
    "No products yet. Configure a design for a product to publish it here.",
  creator_empty_gallery:
    "No gallery entries yet. Share artwork in the gallery without turning it into a product.",
  creator_empty_section: "Nothing here yet.",
  creator_visit_profile: "View profile",
  creators_eyebrow: "Marketplace",
  creators_heading: "Discover creators",
  creators_intro:
    "Independent designers publishing their own products and gallery designs on Gallaxy Store.",
  creators_empty_title: "No creators yet",
  creators_empty: "Creator applications are reviewed before a profile appears here.",
  creators_latest_title: "Latest designs",
  creators_latest_empty:
    "No gallery items have been approved yet — check back soon.",
  creators_unavailable_title: "Creator discovery is not available yet",
  creators_unavailable:
    "The creator features are being enabled on this store. Check back soon.",
  status_draft: "Draft",
  status_pending_review: "Pending Review",
  status_approved: "Approved",
  status_published: "Published",
  status_rejected: "Rejected",
  status_archived: "Archived",
  creator_rejection_feedback: "Feedback",
  creator_not_found: "Creator not found",
  creator_publishing_disabled:
    "Publishing is currently disabled for this account. Contact support if you think this is a mistake.",
  creator_unsaved_changes: "Unsaved changes",
  studio_title: "Design Studio",
  studio_subtitle: "Create, edit and manage your designs",
  studio_my_designs: "My Designs",
  studio_new_design: "New design",
  studio_open_editor: "Open editor",
  studio_empty_title: "No designs yet",
  studio_empty_body: "Upload your first artwork to get started.",
  studio_load_error: "Could not load your designs.",
  studio_page: "Page",
  studio_upload_hint: "Drag & drop or click to upload",
  studio_upload_formats: "PNG, JPG, WebP or SVG — up to 50MB",
  studio_upload_title: "New design",
  studio_design_title: "Title",
  studio_design_title_ph: "Give your design a name",
  studio_create: "Create design",
  studio_creating: "Creating…",
  studio_file_selected: "Selected file",
  studio_warnings: "Warnings",
  studio_replace_artwork: "Replace artwork",
  studio_replace_hint:
    "Your placement is kept — the new artwork is fitted into the previous footprint.",
  studio_back_to_designs: "Back to designs",
  studio_loading_editor: "Loading editor…",
  studio_no_artwork: "This design has no artwork yet.",
  studio_artwork: "Artwork",
  studio_artwork_props: "Artwork properties",
  studio_dimensions_px: "Dimensions",
  studio_format: "Format",
  studio_transparency: "Transparency",
  studio_transparency_yes: "Transparent",
  studio_transparency_no: "Opaque",
  studio_transparency_unknown: "Unknown",
  studio_file_dpi: "File DPI",
  studio_design_details: "Design details",
  studio_description: "Description",
  studio_description_ph: "Describe your design (optional)",
  studio_placement: "Placement",
  studio_pos_x: "X",
  studio_pos_y: "Y",
  studio_width: "Width",
  studio_height: "Height",
  studio_inches: "in",
  studio_rotation: "Rotation",
  studio_aspect_lock: "Lock aspect ratio",
  studio_align: "Align",
  studio_align_left: "Align left",
  studio_align_hcenter: "Center horizontally",
  studio_align_right: "Align right",
  studio_align_top: "Align top",
  studio_align_vcenter: "Center vertically",
  studio_align_bottom: "Align bottom",
  studio_reset_placement: "Reset placement",
  studio_fit_area: "Fit to area",
  studio_zoom: "Zoom",
  studio_zoom_in: "Zoom in",
  studio_zoom_out: "Zoom out",
  studio_zoom_fit: "Fit view",
  studio_undo: "Undo",
  studio_redo: "Redo",
  studio_printable_area: "Printable area",
  studio_hint_drag:
    "Drag to move · handles resize · the top handle rotates",
  studio_save_now: "Save now",
  studio_saving: "Saving…",
  studio_saved: "All changes saved",
  studio_unsaved: "Unsaved changes",
  studio_save_failed: "Save failed — press Save to retry.",
  studio_effective_dpi: "Print resolution",
  studio_dpi: "DPI",
  studio_rename: "Rename",
  studio_rename_title: "Rename design",
  studio_delete_title: "Delete design?",
  studio_delete_body:
    "It disappears from your library. This cannot be undone from here.",
  studio_deleted: "Design deleted.",
  studio_panel_artwork: "Artwork",
  studio_panel_controls: "Controls",
  studio_err_missing_file: "Choose a file to upload.",
  studio_err_title_required: "A title is required.",
  studio_err_too_large: "File is larger than the 50MB limit.",
  studio_err_svg_too_large: "SVG is larger than the 2MB limit.",
  studio_err_unsupported_type:
    "Unsupported file type. Upload a PNG, JPG, WebP or SVG.",
  studio_err_invalid_file: "This file could not be read. It may be damaged or incomplete.",
  studio_err_too_small_dimensions:
    "Image is too small — at least 200×200px is required.",
  studio_err_too_large_dimensions:
    "Image is too large — the maximum is 10000×10000px.",
  studio_err_not_svg: "File is not a valid SVG document.",
  studio_err_storage_rejected: "Storage rejected this file.",
  studio_err_invalid_editor_state: "Editor state is not valid.",
  studio_err_field_not_allowed: "This field cannot be changed from the studio.",
  studio_err_not_found: "Design not found.",
  studio_err_network: "Network error — check your connection and retry.",
  studio_err_generic: "Something went wrong. Please try again.",
  studio_warn_low_resolution:
    "Low source resolution — print quality may suffer.",
  studio_warn_mime_mismatch:
    "File type didn't match its extension — uploaded as detected.",
  studio_warn_overflow: "Artwork extends beyond the printable area.",
  studio_warn_dpi:
    "Effective resolution is below 150 DPI — it may look soft in print.",
  // Phase 5 — mockups endpoint errors
  studio_err_invalid_config: "The preview configuration is not valid.",
  studio_err_no_artwork: "Add artwork to this design first.",
  studio_err_stale_artwork: "The artwork changed — regenerate the preview.",
  studio_err_templates_not_seeded:
    "The product catalog is not set up in this environment yet.",
  studio_err_creator_profile_required: "Create your creator profile first.",
  // Phase 6 — product configuration errors
  studio_err_invalid_body: "The request could not be read.",
  studio_err_not_an_object: "The request data is not valid.",
  studio_err_empty_patch: "Nothing was changed.",
  studio_err_invalid_template: "Unknown product type.",
  studio_err_invalid_colors:
    "One of the selected colors is not available for this product.",
  studio_err_invalid_sizes:
    "One of the selected sizes is not available for this product.",
  studio_err_invalid_view_states: "The placement adjustment is not valid.",
  studio_err_template_inactive: "This product type is not available right now.",
  // Phase 6 — product catalog & configuration
  product_catalog_title: "Product catalog",
  product_catalog_hint: "Add this design to as many products as you like.",
  product_add: "Add",
  product_adding: "Adding…",
  product_added: "Added",
  product_configure: "Configure",
  product_hide: "Hide",
  product_empty: "No products configured yet.",
  product_load_error: "Could not load your products.",
  product_need_artwork: "Add artwork first to configure products.",
  product_colors: "Colors",
  product_sizes: "Sizes",
  product_select_color_hint: "Select at least one color to preview.",
  product_placement: "Per-product placement",
  product_placement_hint: "Adjust this product without moving the design.",
  product_offset_x: "Offset X",
  product_offset_y: "Offset Y",
  product_scale: "Scale",
  product_rotation: "Rotation",
  product_placement_reset: "Reset",
  product_saving: "Saving…",
  product_mockups: "Previews",
  product_mockup_generating: "Generating preview…",
  product_mockup_pending: "Preview not generated yet.",
  product_mockup_failed: "Preview failed.",
  product_mockup_retry: "Retry",
  product_delete: "Remove",
  product_delete_title: "Remove this product?",
  product_delete_body:
    "The configuration and its previews are removed from this design. Your artwork and files stay untouched.",
  product_fulfillment_unconfigured:
    "Not configured for fulfillment — this product cannot be manufactured or shipped yet.",
  product_fulfillment_configured: "Fulfillment configured.",
  product_cat_apparel: "Apparel",
  product_cat_drinkware: "Drinkware",
  product_cat_tech: "Tech",
  product_cat_accessories: "Accessories",
  product_cat_wall_art: "Wall art",
  product_view_front: "Front",
  product_view_back: "Back",
  product_view_top: "Top",
  // Phase 7 — publishing & approval
  studio_err_invalid_title: "Title must be 2-120 characters.",
  studio_err_invalid_target: "Choose what to publish.",
  studio_err_invalid_product_id: "Select a product configuration to publish.",
  studio_err_invalid_name: "Product name must be 1-200 characters.",
  studio_err_invalid_price: "Enter a valid price.",
  studio_err_invalid_description: "Description is too long.",
  studio_err_invalid_category: "That category is not available.",
  studio_err_invalid_tags:
    "Tags must be up to 30 items of up to 40 characters each.",
  studio_err_invalid_visibility: "Visibility must be public or unlisted.",
  studio_err_invalid_preview_path: "That preview does not belong to this design.",
  studio_err_invalid_status: "This item's current status doesn't allow publishing.",
  studio_err_no_mockups: "Generate at least one product preview first.",
  studio_err_already_submitted: "Already submitted — waiting for review.",
  studio_err_already_published: "Already approved and live.",
  studio_err_publish_disabled: "Publishing is disabled for your creator profile.",
  studio_err_design_archived: "This design is archived and cannot be published.",
  studio_err_product_linked:
    "This product is linked to a store listing and can't be removed here.",
  publish_button: "Publish",
  publish_title: "Publish this design",
  publish_target: "What do you want to publish?",
  publish_target_product: "Store product",
  publish_target_product_hint:
    "Sells as a normal store product after admin approval.",
  publish_target_gallery: "Creator gallery",
  publish_target_gallery_hint: "Share the artwork without selling it.",
  publish_product_row: "Which product?",
  publish_no_products: "Add a product type in the catalog first.",
  publish_no_publishable_products:
    "Every product is already in review or live.",
  publish_need_previews:
    "Generate at least one preview before publishing this product.",
  publish_name: "Product name",
  publish_gallery_title: "Title",
  publish_price: "Price",
  publish_description: "Description",
  publish_short_description: "Short description",
  publish_category: "Category",
  publish_category_none: "No category",
  publish_tags: "Tags",
  publish_tags_hint: "Comma-separated, up to 30 tags.",
  publish_visibility: "Visibility",
  publish_visibility_public: "Public",
  publish_visibility_unlisted: "Unlisted",
  publish_preview_note: "Cover: your first generated preview is used.",
  publish_fulfillment_notice:
    "Not configured for fulfillment — the product stays unavailable for shipping until fulfillment is set up.",
  publish_submitting: "Submitting…",
  publish_submit_product: "Submit product for review",
  publish_submit_gallery: "Submit for gallery review",
  publish_success_product: "Product submitted for review.",
  publish_success_gallery: "Gallery item submitted for review.",
  publish_success_note: "Nothing is public until an admin approves it.",
  publish_done: "Done",
  attribution_designed_by: "Designed by",
  attribution_more_by: "More by this creator",
  attribution_visit_profile: "View creator profile",
  // Gift Boxes (product-based bundles)
  gift_box_contents_title: "What's inside this gift box",
  gift_box_contents_value: "Contents value",
  gift_box_savings: "You save",
  gift_box_out_of_stock: "Out of stock",
  gift_box_hidden_notice: "Included in this box only",
  gift_box_empty: "This gift box has no contents yet.",
  gift_box_load_error: "The box contents could not be loaded.",
  gift_box_order_contents: "Gift box contents",
  gift_boxes_empty: "No gift boxes are available right now.",
  gift_boxes_load_error: "Gift boxes could not be loaded.",
  gift_boxes_loading: "Loading gift boxes...",
  gift_box_items_count: "{n} items",
  gift_box_view_product: "View product",
  gift_box_retry: "Retry",
  // Customer Custom Print Studio
  cp_eyebrow: "Studio",
  cp_title_a: "Custom",
  cp_title_b: "Print",
  cp_title_c: "Studio",
  cp_subtitle: "Upload your artwork, place it on a real product, review print quality and order it — all through the normal Galaxy Store checkout. Sharing is completely optional.",
  cp_signin: "Sign in to save designs and place custom print orders. Your progress stays on this page.",
  cp_live_mockup: "Live mockup",
  cp_photo_ready: "Photorealistic mockup",
  cp_photo_loading: "Loading photo mockup…",
  cp_photo_error: "The product photograph could not be loaded. No vector substitute will be shown.",
  cp_preview_empty: "Choose a product and upload artwork to preview",
  cp_drag_hint: "Drag artwork to reposition",
  cp_undo: "Undo",
  cp_redo: "Redo",
  cp_center: "Center",
  cp_reset: "Reset",
  cp_rotate15: "+15°",
  cp_print_check: "Print-quality check",
  cp_panel_product: "1. Product",
  cp_panel_options: "2. Colour, size & view",
  cp_panel_upload: "3. Upload artwork",
  cp_panel_placement: "4. Placement",
  cp_panel_order: "5. Order & sharing",
  cp_design_title: "Design title",
  cp_design_title_ph: "My custom design",
  cp_quantity: "Quantity",
  cp_upload_hint: "Drop or choose your artwork",
  cp_upload_formats: "PNG, JPG, WebP or SVG · max 50 MB",
  cp_dpi_source: "DPI source",
  cp_transparency: "Transparency",
  cp_yes: "yes",
  cp_no: "no",
  cp_size: "Size",
  cp_rotation: "Rotation",
  cp_horizontal: "Horizontal",
  cp_vertical: "Vertical",
  cp_share_title: "Share my design on Galaxy Store",
  cp_share_hint: "Optional. Subject to admin approval. Your order succeeds either way and private artwork is never published.",
  cp_save_private: "Save design privately",
  cp_add_cart: "Add to cart",
  cp_notice_private: "Added to cart. Your artwork stays private.",
  cp_notice_shared: "Added to cart. Your design was submitted for admin review before public sharing.",
  cp_warn_overflow: "Artwork extends outside the printable area — it may be clipped in print.",
  cp_warn_lowres: "Source resolution is {dpi} DPI; 150+ DPI is recommended for print.",
  cp_warn_dpi: "Placed artwork prints at about {dpi} DPI — consider a smaller placement or a larger file.",
  cp_warn_transparency: "Transparent pixels will print as the product colour.",
};

const ar: TranslationKeys = {
  // Navigation
  nav_home: "الرئيسية",
  nav_products: "المنتجات",
  nav_custom_print: "طباعة مخصصة",
  nav_gallery: "المعرض",
  nav_designs: "التصاميم",
  nav_gift_boxes: "صناديق الهدايا",
  nav_creators: "المبدعون",
  nav_cart: "السلة",
  nav_wishlist: "المفضلة",
  nav_orders: "طلباتي",
  nav_admin: "الإدارة",
  nav_login: "تسجيل الدخول",
  nav_register: "إنشاء حساب",
  nav_logout: "تسجيل الخروج",

  // Home
  home_title: "جالاكسي ستور",
  home_subtitle: "طباعة مخصصة ومعدات ألعاب فاخرة",
  home_cta: "تسوق الآن",

  // Products
  products_title: "جميع المنتجات",
  products_subtitle: "طباعة مخصصة فاخرة ومعدات ألعاب وهدايا كونية.",
  products_search: "بحث في المنتجات...",
  products_filters: "الفلاتر",
  products_all: "الكل",
  products_sort: "ترتيب حسب",
  products_price_range: "نطاق السعر",
  products_min_rating: "الحد الأدنى للتقييم",
  products_no_results: "لا توجد منتجات تطابق الفلاتر.",
  products_per_page: "لكل صفحة",

  // Product Details
  product_add_to_cart: "أضف إلى السلة",
  product_buy_now: "اشتري الآن",
  product_description: "الوصف",
  product_specs: "المواصفات",
  product_images: "الصور",
  product_reviews: "التقييمات",
  product_related: "منتجات مشابهة",
  product_color: "اللون",
  product_size: "المقاس",
  product_quantity: "الكمية",

  // Cart
  cart_title: "سلة المشتريات",
  cart_empty: "سلتك فارغة",
  cart_continue_shopping: "متابعة التسوق",
  cart_clear: "تفريغ السلة",
  cart_summary: "ملخص الطلب",
  cart_subtotal: "المجموع الفرعي",
  cart_shipping: "الشحن",
  cart_free: "مجاني",
  cart_discount: "الخصم",
  cart_total: "المجموع",
  cart_checkout: "إتمام الشراء",
  cart_promo_code: "كود الخصم",
  cart_apply: "تطبيق",

  // Checkout
  checkout_title: "إتمام الشراء",
  checkout_address: "عنوان الشحن",
  checkout_payment: "طريقة الدفع",
  checkout_confirm: "تأكيد الطلب",
  checkout_full_name: "الاسم الكامل",
  checkout_phone: "الهاتف",
  checkout_street: "العنوان",
  checkout_city: "المدينة",
  checkout_state: "المحافظة",
  checkout_zip: "الرمز البريدي",
  checkout_country: "الدولة",
  checkout_notes: "ملاحظات",
  checkout_continue: "متابعة",
  checkout_place_order: "تأكيد الطلب",
  checkout_cash_on_delivery: "الدفع عند الاستلام",
  checkout_card: "بطاقة ائتمان",
  checkout_success: "تم الدفع بنجاح!",
  checkout_cancelled: "تم إلغاء الدفع",

  // Auth
  login_title: "تسجيل الدخول",
  login_email: "البريد الإلكتروني",
  login_password: "كلمة المرور",
  login_submit: "تسجيل الدخول",
  login_register_link: "ليس لديك حساب؟ إنشاء حساب",
  register_title: "إنشاء حساب",
  register_name: "الاسم الكامل",
  register_email: "البريد الإلكتروني",
  register_password: "كلمة المرور",
  register_confirm_password: "تأكيد كلمة المرور",
  register_submit: "إنشاء حساب",
  register_login_link: "لديك حساب بالفعل؟ تسجيل الدخول",

  // Orders
  orders_title: "طلباتي",
  orders_empty: "لا توجد طلبات بعد",
  orders_id: "رقم الطلب",
  orders_date: "التاريخ",
  orders_status: "الحالة",
  orders_total: "المجموع",

  // Wishlist
  wishlist_title: "المفضلة",
  wishlist_empty: "قائمة المفضلة فارغة",
  wishlist_view_product: "عرض المنتج",

  // Gallery
  gallery_title: "المعرض",
  gallery_subtitle: "استكشف مجموعتنا من التصاميم المخصصة والأعمال الإبداعية.",

  // Gift Boxes
  gift_boxes_title: "صناديق الهدايا",
  gift_boxes_subtitle: "صناديق هدايا مختارة لكل مناسبة.",
  gift_boxes_custom: "تحتاج صندوق مخصص؟",
  gift_boxes_request: "طلب صندوق مخصص",

  // Custom Print
  custom_print_title: "استوديو الطباعة المخصصة",
  custom_print_subtitle: "صمم طباعتك المخصصة.",
  custom_print_choose_product: "اختر المنتج",
  custom_print_upload: "رفع صورة",
  custom_print_text: "نص مخصص",
  custom_print_size: "المقاس",
  custom_print_color: "اللون",
  custom_print_notes: "ملاحظات",

  // Common
  common_loading: "جاري التحميل...",
  common_error: "خطأ",
  common_save: "حفظ",
  common_cancel: "إلغاء",
  common_delete: "حذف",
  common_edit: "تعديل",
  common_back: "رجوع",
  common_next: "التالي",
  common_previous: "السابق",
  common_view_all: "عرض الكل",
  common_learn_more: "اعرف المزيد",
  common_retry: "أعد المحاولة",

  // Creator Studio (dashboard + public profile)
  creator_dashboard: "لوحة المصمم",
  creator_login_required: "سجّل الدخول لفتح لوحة المصمم الخاصة بك.",
  creator_overview: "نظرة عامة",
  creator_tab_designs: "تصامييمي",
  creator_tab_products: "منتجاتي",
  creator_tab_gallery: "معرضي",
  creator_tab_drafts: "المسودات",
  creator_tab_pending: "قيد المراجعة",
  creator_tab_rejected: "المرفوضة",
  creator_tab_settings: "الإعدادات",
  creator_stat_designs: "التصاميم",
  creator_stat_published_products: "المنتجات المنشورة",
  creator_stat_gallery: "إدخالات المعرض",
  creator_stat_pending: "قيد المراجعة",
  creator_no_profile_title: "اختر هويتك كصمّام",
  creator_no_profile_body:
    "اختر اسم مستخدم عام لفتح ملفك. بعدها يمكنك نشر التصاميم والمنتجات.",
  creator_create_profile: "إنشاء الملف",
  creator_username: "اسم المستخدم",
  creator_username_hint: "من 3 إلى 30 حرفا: أحرف وأرقام وشرطة سفلية",
  creator_display_name: "الاسم المعروض",
  creator_bio: "نبذة",
  creator_social_links: "روابط التواصل",
  creator_profile_saved: "تم حفظ الملف",
  creator_view_public_profile: "عرض الملف العام",
  creator_public_profile: "الملف العام",
  creator_products_count: "المنتجات",
  creator_gallery_count: "المعرض",
  creator_designs_count: "التصاميم",
  creator_joined: "انضم في",
  creator_featured: "مميّز",
  creator_empty_designs: "لا توجد تصاميم بعد. افتح الاستوديو لرفع أول عمل فني.",
  creator_empty_products: "لا توجد منتجات بعد. جهّز تصميماً لمنتج لينشره هنا.",
  creator_empty_gallery:
    "لا توجد إدخالات بعد. شارك أعمالك في المعرض دون تحويلها إلى منتج.",
  creator_empty_section: "لا يوجد شيء هنا بعد.",
  creator_visit_profile: "عرض الملف",
  creators_eyebrow: "السوق",
  creators_heading: "اكتشف المبدعين",
  creators_intro:
    "مصممون مستقلون ينشرون منتجاتهم وتصاميم معرضهم على غالاكسي ستور.",
  creators_empty_title: "لا يوجد مبدعون بعد",
  creators_empty: "تتم مراجعة طلبات المبدعين قبل ظهور ملف هنا.",
  creators_latest_title: "أحدث التصاميم",
  creators_latest_empty:
    "لم تتم الموافقة على أي عمل في المعرض بعد — تفقدنا لاحقاً.",
  creators_unavailable_title: "اكتشاف المبدعين غير متاح بعد",
  creators_unavailable:
    "خصائص المبدعين قيد التفعيل على هذا المتجر. تفقدنا لاحقاً.",
  status_draft: "مسودة",
  status_pending_review: "قيد المراجعة",
  status_approved: "مقبول",
  status_published: "منشور",
  status_rejected: "مرفوض",
  status_archived: "مؤرشف",
  creator_rejection_feedback: "الملاحظات",
  creator_not_found: "المصمم غير موجود",
  creator_publishing_disabled:
    "النشر معطّل حالياً لهذا الحساب. تواصل مع الدعم لو تعتقد أن هذا خطأ.",
  creator_unsaved_changes: "تغييرات غير محفوظة",
  studio_title: "استوديو التصاميم",
  studio_subtitle: "أنشئ وعدّل وأدر تصاميمك",
  studio_my_designs: "تصاميمي",
  studio_new_design: "تصميم جديد",
  studio_open_editor: "فتح المحرر",
  studio_empty_title: "لا توجد تصاميم بعد",
  studio_empty_body: "ارفع أول عمل فني للبدء.",
  studio_load_error: "تعذّر تحميل تصاميمك.",
  studio_page: "صفحة",
  studio_upload_hint: "اسحب وأفلت أو انقر لرفع ملف",
  studio_upload_formats: "PNG أو JPG أو WebP أو SVG — حتى 50 ميغابايت",
  studio_upload_title: "تصميم جديد",
  studio_design_title: "العنوان",
  studio_design_title_ph: "أعط تصميك اسماً",
  studio_create: "إنشاء التصميم",
  studio_creating: "جارٍ الإنشاء…",
  studio_file_selected: "الملف المحدد",
  studio_warnings: "تحذيرات",
  studio_replace_artwork: "استبدال العمل الفني",
  studio_replace_hint: "يبقى وضعك كما هو — يُركَّب العمل الجديد داخل المساحة السابقة.",
  studio_back_to_designs: "العودة إلى التصاميم",
  studio_loading_editor: "جارٍ تحميل المحرر…",
  studio_no_artwork: "هذا التصميم بلا عمل فني بعد.",
  studio_artwork: "العمل الفني",
  studio_artwork_props: "خصائص العمل الفني",
  studio_dimensions_px: "الأبعاد",
  studio_format: "الصيغة",
  studio_transparency: "الشفافية",
  studio_transparency_yes: "شفاف",
  studio_transparency_no: "معتم",
  studio_transparency_unknown: "غير معروف",
  studio_file_dpi: "دقة الملف",
  studio_design_details: "تفاصيل التصميم",
  studio_description: "الوصف",
  studio_description_ph: "صِف تصميمك (اختياري)",
  studio_placement: "الوضع",
  studio_pos_x: "س",
  studio_pos_y: "ص",
  studio_width: "العرض",
  studio_height: "الارتفاع",
  studio_inches: "إنش",
  studio_rotation: "التدوير",
  studio_aspect_lock: "قفل نسبة الأبعاد",
  studio_align: "المحاذاة",
  studio_align_left: "محاذاة لليسار",
  studio_align_hcenter: "توسيط أفقي",
  studio_align_right: "محاذاة لليمين",
  studio_align_top: "محاذاة للأعلى",
  studio_align_vcenter: "توسيط رأسي",
  studio_align_bottom: "محاذاة للأسفل",
  studio_reset_placement: "إعادة ضبط الوضع",
  studio_fit_area: "ملاءمة المساحة",
  studio_zoom: "التكبير",
  studio_zoom_in: "تكبير",
  studio_zoom_out: "تصغير",
  studio_zoom_fit: "ملاءمة العرض",
  studio_undo: "تراجع",
  studio_redo: "إعادة",
  studio_printable_area: "المنطقة القابلة للطباعة",
  studio_hint_drag: "اسحب للتحريك · المقابض تغيّر الحجم · المقبض العلوي يُدوِّر",
  studio_save_now: "حفظ الآن",
  studio_saving: "جارٍ الحفظ…",
  studio_saved: "كل التغييرات محفوظة",
  studio_unsaved: "تغييرات غير محفوظة",
  studio_save_failed: "فشل الحفظ — اضغط «حفظ الآن» للمحاولة.",
  studio_effective_dpi: "دقة الطباعة",
  studio_dpi: "DPI",
  studio_rename: "إعادة تسمية",
  studio_rename_title: "إعادة تسمية التصميم",
  studio_delete_title: "حذف التصميم؟",
  studio_delete_body: "سيُزال من مكتبتك ولا يمكن التراجع عن ذلك من هنا.",
  studio_deleted: "تم حذف التصميم.",
  studio_panel_artwork: "العمل الفني",
  studio_panel_controls: "أدوات التحكم",
  studio_err_missing_file: "اختر ملفاً للرفع.",
  studio_err_title_required: "العنوان مطلوب.",
  studio_err_too_large: "حجم الملف يتجاوز حد 50 ميغابايت.",
  studio_err_svg_too_large: "حجم ملف SVG يتجاوز حد 2 ميغابايت.",
  studio_err_unsupported_type: "نوع ملف غير مدعوم. ارفع PNG أو JPG أو WebP أو SVG.",
  studio_err_invalid_file: "تعذّر قراءة هذا الملف — قد يكون تالفاً أو غير مكتمل.",
  studio_err_too_small_dimensions: "الصورة صغيرة جداً — الحد الأدنى 200×200 بكسل.",
  studio_err_too_large_dimensions: "الصورة كبيرة جداً — الحد الأقصى 10000×10000 بكسل.",
  studio_err_not_svg: "الملف ليس مستند SVG صالحاً.",
  studio_err_storage_rejected: "رفض التخزين هذا الملف.",
  studio_err_invalid_editor_state: "حالة المحرر غير صالحة.",
  studio_err_field_not_allowed: "لا يمكن تغيير هذا الحقل من الاستوديو.",
  studio_err_not_found: "التصميم غير موجود.",
  studio_err_network: "خطأ في الشبكة — تحقق من اتصالك وأعد المحاولة.",
  studio_err_generic: "حدث خطأ ما. حاول مرة أخرى.",
  studio_warn_low_resolution: "دقة المصدر منخفضة — قد تتأثر جودة الطباعة.",
  studio_warn_mime_mismatch: "نوع الملف لا يطابق الامتداد — رُفع بالصيغة المكتشفة.",
  studio_warn_overflow: "العمل الفني يتجاوز المنطقة القابلة للطباعة.",
  studio_warn_dpi: "دقة الطباعة أقل من 150 نقطة/بوصة — قد تبدو الصورة ناعمة.",
  // Phase 5 — أخطاء واجهة المعاينات
  studio_err_invalid_config: "إعدادات المعاينة غير صالحة.",
  studio_err_no_artwork: "أضف التصميم إلى هذا المخطط أولاً.",
  studio_err_stale_artwork: "تغيّر التصميم — أعد إنشاء المعاينة.",
  studio_err_templates_not_seeded: "لم يتم إعداد كتالوج المنتجات في هذه البيئة بعد.",
  studio_err_creator_profile_required: "أنشئ ملفك كمنشئ أولاً.",
  // Phase 6 — أخطاء إعداد المنتجات
  studio_err_invalid_body: "تعذّرت قراءة الطلب.",
  studio_err_not_an_object: "بيانات الطلب غير صالحة.",
  studio_err_empty_patch: "لم يتم تغيير أي شيء.",
  studio_err_invalid_template: "نوع منتج غير معروف.",
  studio_err_invalid_colors: "أحد الألوان المختارة غير متاح لهذا المنتج.",
  studio_err_invalid_sizes: "أحد المقاسات المختارة غير متاح لهذا المنتج.",
  studio_err_invalid_view_states: "تعديل الوضع غير صالح.",
  studio_err_template_inactive: "نوع المنتج هذا غير متاح حالياً.",
  // Phase 6 — كتالوج المنتجات والإعداد
  product_catalog_title: "كتالوج المنتجات",
  product_catalog_hint: "أضف هذا التصميم إلى أكبر عدد من المنتجات التي تريده.",
  product_add: "إضافة",
  product_adding: "جارٍ الإضافة…",
  product_added: "مُضاف",
  product_configure: "الإعداد",
  product_hide: "إخفاء",
  product_empty: "لم يتم إعداد أي منتج بعد.",
  product_load_error: "تعذّر تحميل منتجاتك.",
  product_need_artwork: "أضف التصميم أولاً لتكوين المنتجات.",
  product_colors: "الألوان",
  product_sizes: "المقاسات",
  product_select_color_hint: "اختر لوناً واحداً على الأقل للمعاينة.",
  product_placement: "وضع المنتج الخاص",
  product_placement_hint: "عدّل هذا المنتج دون تحريك التصميم.",
  product_offset_x: "الإزاحة س",
  product_offset_y: "الإزاحة ص",
  product_scale: "التكبير",
  product_rotation: "الدوران",
  product_placement_reset: "إعادة ضبط",
  product_saving: "جارٍ الحفظ…",
  product_mockups: "المعاينات",
  product_mockup_generating: "جارٍ إنشاء المعاينة…",
  product_mockup_pending: "لم يتم إنشاء المعاينة بعد.",
  product_mockup_failed: "فشلت المعاينة.",
  product_mockup_retry: "إعادة المحاولة",
  product_delete: "إزالة",
  product_delete_title: "هل تريد إزالة هذا المنتج؟",
  product_delete_body:
    "سيتم إزالة الإعداد ومعايناته من هذا التصميم. تبقى ملفاتك وتصميمك كما هم.",
  product_fulfillment_unconfigured:
    "غير مُعدّ للتصنيع — لا يمكن تصنيع هذا المنتج أو شحنه بعد.",
  product_fulfillment_configured: "تم إعداد التصنيع.",
  product_cat_apparel: "ملابس",
  product_cat_drinkware: "أواني المشروبات",
  product_cat_tech: "إلكترونيات",
  product_cat_accessories: "إكسسوارات",
  product_cat_wall_art: "فن جداري",
  product_view_front: "أمامي",
  product_view_back: "خلفي",
  product_view_top: "علوي",
  // Phase 7 — النشر والاعتماد
  studio_err_invalid_title: "يجب أن يكون العنوان بين 2 و120 حرفاً.",
  studio_err_invalid_target: "اختر ما تريد نشره.",
  studio_err_invalid_product_id: "اختر إعداد المنتج المراد نشره.",
  studio_err_invalid_name: "يجب أن يكون اسم المنتج بين 1 و200 حرف.",
  studio_err_invalid_price: "أدخل سعراً صالحاً.",
  studio_err_invalid_description: "الوصف طويل جداً.",
  studio_err_invalid_category: "هذا التصنيف غير متاح.",
  studio_err_invalid_tags:
    "يجب ألا يتجاوز الوسوم 30 وسماً، لكل وسم 40 حرفاً كحد أقصى.",
  studio_err_invalid_visibility: "يجب أن يكون الظهور عاماً أو غير مدرج.",
  studio_err_invalid_preview_path: "هذه المعاينة لا تنتمي إلى هذا التصميم.",
  studio_err_invalid_status: "الحالة الحالية لهذا العنصر لا تسمح بالنشر.",
  studio_err_no_mockups: "أنشئ معاينة منتج واحدة على الأقل أولاً.",
  studio_err_already_submitted: "تم الإرسال بالفعل — بانتظار المراجعة.",
  studio_err_already_published: "تمت الموافقة ونشره بالفعل.",
  studio_err_publish_disabled: "النشر معطّل لملفك كمنشئ.",
  studio_err_design_archived: "هذا التصميم مؤرشف ولا يمكن نشره.",
  studio_err_product_linked:
    "هذا المنتج مرتبط بقائمة في المتجر ولا يمكن إزالته من هنا.",
  publish_button: "نشر",
  publish_title: "نشر هذا التصميم",
  publish_target: "ماذا تريد أن تنشر؟",
  publish_target_product: "منتج في المتجر",
  publish_target_product_hint:
    "يُباع كمنتج عادي في المتجر بعد موافقة المشرف.",
  publish_target_gallery: "معرض المبدعين",
  publish_target_gallery_hint: "شارك العمل الفني دون بيعه.",
  publish_product_row: "أي منتج؟",
  publish_no_products: "أضف نوع منتج في الكتالوج أولاً.",
  publish_no_publishable_products: "كل المنتجات قيد المراجعة أو منشورة بالفعل.",
  publish_need_previews: "أنشئ معاينة واحدة على الأقل قبل نشر هذا المنتج.",
  publish_name: "اسم المنتج",
  publish_gallery_title: "العنوان",
  publish_price: "السعر",
  publish_description: "الوصف",
  publish_short_description: "وصف مختصر",
  publish_category: "التصنيف",
  publish_category_none: "بدون تصنيف",
  publish_tags: "الوسوم",
  publish_tags_hint: "مفصولة بفواصل، حتى 30 وسماً.",
  publish_visibility: "الظهور",
  publish_visibility_public: "عام",
  publish_visibility_unlisted: "غير مدرج",
  publish_preview_note: "الغلاف: تُستخدم أول معاينة تم إنشاؤها.",
  publish_fulfillment_notice:
    "غير مُعدّ للتصنيع — يبقى المنتج غير متاح للشحن حتى إعداد التصنيع.",
  publish_submitting: "جارٍ الإرسال…",
  publish_submit_product: "إرسال المنتج للمراجعة",
  publish_submit_gallery: "إرسال إلى مراجعة المعرض",
  publish_success_product: "تم إرسال المنتج للمراجعة.",
  publish_success_gallery: "تم إرسال عنصر المعرض للمراجعة.",
  publish_success_note: "لا شيء يظهر للعامة حتى يوافق المشرف.",
  publish_done: "تم",
  attribution_designed_by: "من تصميم",
  attribution_more_by: "المزيد من هذا المبدع",
  attribution_visit_profile: "عرض ملف المبدع",
  // صناديق الهدايا (حزم من منتجات الكتالوج)
  gift_box_contents_title: "محتوى صندوق الهدية",
  gift_box_contents_value: "قيمة المحتوى",
  gift_box_savings: "توفّر",
  gift_box_out_of_stock: "نفد المخزون",
  gift_box_hidden_notice: "موجود داخل هذا الصندوق فقط",
  gift_box_empty: "لا يحتوي هذا الصندوق على محتويات بعد.",
  gift_box_load_error: "تعذّر تحميل محتوى الصندوق.",
  gift_box_order_contents: "محتوى صندوق الهدية",
  gift_boxes_empty: "لا توجد صناديق هدايا متاحة حاليًا.",
  gift_boxes_load_error: "تعذّر تحميل صناديق الهدايا.",
  gift_boxes_loading: "جارٍ تحميل صناديق الهدايا...",
  gift_box_items_count: "{n} عناصر",
  gift_box_view_product: "عرض المنتج",
  gift_box_retry: "إعادة المحاولة",
  // Customer Custom Print Studio
  cp_eyebrow: "استوديو",
  cp_title_a: "استوديو",
  cp_title_b: "الطباعة",
  cp_title_c: "المخصصة",
  cp_subtitle: "ارفع تصميمك، ضعه على منتج حقيقي، راجع جودة الطباعة واطلبه — كل ذلك عبر نظام الطلب المعتاد في متجر جالاكسي. المشاركة اختيارية تمامًا.",
  cp_signin: "سجّل الدخول لحفظ التصميمات وتقديم طلبات الطباعة المخصصة. سيبقى تقدمك على هذه الصفحة.",
  cp_live_mockup: "معاينة مباشرة",
  cp_photo_ready: "موكتاب فوتوغرافي واقعي",
  cp_photo_loading: "جارٍ تحميل صورة المنتج…",
  cp_photo_error: "تعذّر تحميل صورة المنتج. لن يتم عرض أي رسم بديل.",
  cp_preview_empty: "اختر منتجًا وارفع تصميمًا للمعاينة",
  cp_drag_hint: "اسحب التصميم لتغيير موضعه",
  cp_undo: "تراجع",
  cp_redo: "إعادة",
  cp_center: "توسيط",
  cp_reset: "إعادة ضبط",
  cp_rotate15: "°15+",
  cp_print_check: "فحص جودة الطباعة",
  cp_panel_product: "١. المنتج",
  cp_panel_options: "٢. اللون والمقاس والمنظور",
  cp_panel_upload: "٣. رفع التصميم",
  cp_panel_placement: "٤. الوضع والتخصيص",
  cp_panel_order: "٥. الطلب والمشاركة",
  cp_design_title: "عنوان التصميم",
  cp_design_title_ph: "تصميمي المخصص",
  cp_quantity: "الكمية",
  cp_upload_hint: "اسحب الملف أو اختر تصميمك",
  cp_upload_formats: "PNG أو JPG أو WebP أو SVG · حتى ٥٠ ميجابايت",
  cp_dpi_source: "دقة المصدر",
  cp_transparency: "الشفافية",
  cp_yes: "نعم",
  cp_no: "لا",
  cp_size: "الحجم",
  cp_rotation: "الدوران",
  cp_horizontal: "أفقي",
  cp_vertical: "رأسي",
  cp_share_title: "مشاركة تصميمي في متجر جالاكسي",
  cp_share_hint: "اختياري. يخضع لموافقة المشرف. طلبك مكتمل على أي حال، والتصميمات الخاصة لا تُنشر أبدًا.",
  cp_save_private: "حفظ التصميم بشكل خاص",
  cp_add_cart: "أضف إلى السلة",
  cp_notice_private: "أُضيف إلى السلة. يبقى تصميمك خاصًا.",
  cp_notice_shared: "أُضيف إلى السلة. أُرسل تصميمك لمراجعة المشرف قبل النشر العام.",
  cp_warn_overflow: "يمتد التصميم خارج منطقة الطباعة — قد يتم قصّه عند الطباعة.",
  cp_warn_lowres: "دقة المصدر {dpi} نقطة/بوصة؛ يُنصح بـ ١٥٠ فأعلى للطباعة.",
  cp_warn_dpi: "تُطبع التصميمات بمعدل تقريبي {dpi} نقطة/بوصة — فكر في تصغيرها أو استخدام ملف أكبر.",
  cp_warn_transparency: "ستُطبع البكسلات الشفافة بلون المنتج.",
};

export const translations: Record<Locale, TranslationKeys> = {
  en,
  ar,
};

export function t(locale: Locale, key: keyof TranslationKeys): string {
  const translationsObj = translations[locale] || translations[defaultLocale];
  return translationsObj[key] || key;
}
