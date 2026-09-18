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
  nav_gift_boxes: string;
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
};

const en: TranslationKeys = {
  // Navigation
  nav_home: "Home",
  nav_products: "Products",
  nav_custom_print: "Custom Print",
  nav_gallery: "Gallery",
  nav_gift_boxes: "Gift Boxes",
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
};

const ar: TranslationKeys = {
  // Navigation
  nav_home: "الرئيسية",
  nav_products: "المنتجات",
  nav_custom_print: "طباعة مخصصة",
  nav_gallery: "المعرض",
  nav_gift_boxes: "صناديق الهدايا",
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
};

export const translations: Record<Locale, TranslationKeys> = {
  en,
  ar,
};

export function t(locale: Locale, key: keyof TranslationKeys): string {
  const translationsObj = translations[locale] || translations[defaultLocale];
  return translationsObj[key] || key;
}
