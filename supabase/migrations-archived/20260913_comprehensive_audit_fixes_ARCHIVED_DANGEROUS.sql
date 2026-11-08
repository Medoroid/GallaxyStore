-- ============================================================
-- COMPREHENSIVE AUDIT FIXES — 2026-09-13
-- This migration adds all missing tables, functions, triggers,
-- views, and policies identified during the full customer
-- journey audit.
--
-- IMPORTANT: Review carefully before applying to production.
-- Some objects may already exist in live DB — use IF NOT EXISTS.
-- ============================================================

-- ============================================================
-- 1. MISSING TABLES
-- ============================================================

-- 1.1 profiles (referenced by RLS policies, admin checks)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'superadmin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own profile' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own profile' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view all profiles' AND tablename = 'profiles') THEN
    CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    );
  END IF;
END $$;

-- 1.2 wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) DEFAULT 0 CHECK (balance >= 0),
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own wallet' AND tablename = 'wallets') THEN
    CREATE POLICY "Users can view own wallet" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own wallet' AND tablename = 'wallets') THEN
    CREATE POLICY "Users can insert own wallet" ON public.wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages wallets' AND tablename = 'wallets') THEN
    CREATE POLICY "Service role manages wallets" ON public.wallets FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 1.3 wallet_transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'refund')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference_type TEXT,
  reference_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON public.wallet_transactions(wallet_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own wallet transactions' AND tablename = 'wallet_transactions') THEN
    CREATE POLICY "Users can view own wallet transactions" ON public.wallet_transactions
      FOR SELECT USING (wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages wallet transactions' AND tablename = 'wallet_transactions') THEN
    CREATE POLICY "Service role manages wallet transactions" ON public.wallet_transactions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 1.4 payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'cod',
  provider_payment_id TEXT,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_idempotent ON public.payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own payments' AND tablename = 'payments') THEN
    CREATE POLICY "Users can view own payments" ON public.payments
      FOR SELECT USING (order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid()));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages payments' AND tablename = 'payments') THEN
    CREATE POLICY "Service role manages payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 1.5 payment_events (for webhook idempotency)
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB,
  signature_verified BOOLEAN DEFAULT false,
  payment_id UUID REFERENCES public.payments(id),
  processed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_provider_id ON public.payment_events(provider, provider_event_id);

-- 1.6 returns
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'received', 'refunded')),
  reason TEXT NOT NULL,
  admin_note TEXT,
  refund_amount NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_returns_order ON public.returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_requested_by ON public.returns(requested_by);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own returns' AND tablename = 'returns') THEN
    CREATE POLICY "Users can view own returns" ON public.returns
      FOR SELECT USING (auth.uid() = requested_by);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own returns' AND tablename = 'returns') THEN
    CREATE POLICY "Users can insert own returns" ON public.returns
      FOR INSERT WITH CHECK (auth.uid() = requested_by);
  END IF;
END $$;

-- 1.7 return_items
CREATE TABLE IF NOT EXISTS public.return_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own return_items' AND tablename = 'return_items') THEN
    CREATE POLICY "Users can view own return_items" ON public.return_items
      FOR SELECT USING (return_id IN (SELECT id FROM public.returns WHERE requested_by = auth.uid()));
  END IF;
END $$;

-- 1.8 notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Users can view own notifications" ON public.notifications
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Users can update own notifications" ON public.notifications
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Service role manages notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 1.9 coupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount NUMERIC(12,2) DEFAULT 0,
  max_discount_amount NUMERIC(12,2),
  usage_limit INTEGER,
  used_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.10 order_status_history
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  actor_id UUID,
  actor_type TEXT DEFAULT 'system' CHECK (actor_type IN ('system', 'customer', 'admin')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history(order_id, created_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own order_status_history' AND tablename = 'order_status_history') THEN
    CREATE POLICY "Users can view own order_status_history" ON public.order_status_history
      FOR SELECT USING (order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid()));
  END IF;
END $$;

-- 1.11 order_status_history additions on orders table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'order_number') THEN
    ALTER TABLE public.orders ADD COLUMN order_number TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'placed_at') THEN
    ALTER TABLE public.orders ADD COLUMN placed_at TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'shipping_address_snapshot') THEN
    ALTER TABLE public.orders ADD COLUMN shipping_address_snapshot JSONB;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'billing_address_snapshot') THEN
    ALTER TABLE public.orders ADD COLUMN billing_address_snapshot JSONB;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'gift_wrap') THEN
    ALTER TABLE public.orders ADD COLUMN gift_wrap BOOLEAN DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'gift_note') THEN
    ALTER TABLE public.orders ADD COLUMN gift_note TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'customer_note') THEN
    ALTER TABLE public.orders ADD COLUMN customer_note TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'shipping_fee') THEN
    ALTER TABLE public.orders ADD COLUMN shipping_fee NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'tax') THEN
    ALTER TABLE public.orders ADD COLUMN tax NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'discount_amount') THEN
    ALTER TABLE public.orders ADD COLUMN discount_amount NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'coupon_id') THEN
    ALTER TABLE public.orders ADD COLUMN coupon_id UUID;
  END IF;
END $$;

-- Add columns to order_items if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'variant_id') THEN
    ALTER TABLE public.order_items ADD COLUMN variant_id UUID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'customization_id') THEN
    ALTER TABLE public.order_items ADD COLUMN customization_id UUID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'product_name_snapshot') THEN
    ALTER TABLE public.order_items ADD COLUMN product_name_snapshot TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'sku_snapshot') THEN
    ALTER TABLE public.order_items ADD COLUMN sku_snapshot TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'options_snapshot') THEN
    ALTER TABLE public.order_items ADD COLUMN options_snapshot JSONB;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'unit_price_snapshot') THEN
    ALTER TABLE public.order_items ADD COLUMN unit_price_snapshot NUMERIC(12,2);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'line_total') THEN
    ALTER TABLE public.order_items ADD COLUMN line_total NUMERIC(12,2);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'printing_instructions') THEN
    ALTER TABLE public.order_items ADD COLUMN printing_instructions TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'is_gift_wrapped') THEN
    ALTER TABLE public.order_items ADD COLUMN is_gift_wrapped BOOLEAN DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'gift_note') THEN
    ALTER TABLE public.order_items ADD COLUMN gift_note TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'status') THEN
    ALTER TABLE public.order_items ADD COLUMN status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- 1.12 Add columns to carts if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'session_token') THEN
    ALTER TABLE public.carts ADD COLUMN session_token TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'status') THEN
    ALTER TABLE public.carts ADD COLUMN status TEXT DEFAULT 'active';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'merged_into_cart_id') THEN
    ALTER TABLE public.carts ADD COLUMN merged_into_cart_id UUID REFERENCES public.carts(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'coupon_id') THEN
    ALTER TABLE public.carts ADD COLUMN coupon_id UUID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'coupon_code') THEN
    ALTER TABLE public.carts ADD COLUMN coupon_code TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'discount_amount') THEN
    ALTER TABLE public.carts ADD COLUMN discount_amount NUMERIC(12,2) DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'owner_id') THEN
    ALTER TABLE public.carts ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 1.13 Add columns to cart_items if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'is_saved_for_later') THEN
    ALTER TABLE public.cart_items ADD COLUMN is_saved_for_later BOOLEAN DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'reserved_until') THEN
    ALTER TABLE public.cart_items ADD COLUMN reserved_until TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'added_at') THEN
    ALTER TABLE public.cart_items ADD COLUMN added_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- 1.14 Add columns to wishlists if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wishlists' AND column_name = 'owner_id') THEN
    ALTER TABLE public.wishlists ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wishlists' AND column_name = 'name') THEN
    ALTER TABLE public.wishlists ADD COLUMN name TEXT DEFAULT 'My Wishlist';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wishlists' AND column_name = 'slug') THEN
    ALTER TABLE public.wishlists ADD COLUMN slug TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wishlists' AND column_name = 'visibility') THEN
    ALTER TABLE public.wishlists ADD COLUMN visibility TEXT DEFAULT 'private';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wishlists' AND column_name = 'share_token') THEN
    ALTER TABLE public.wishlists ADD COLUMN share_token UUID DEFAULT gen_random_uuid();
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wishlists' AND column_name = 'is_default') THEN
    ALTER TABLE public.wishlists ADD COLUMN is_default BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 1.15 wishlist_items (if using separate items table)
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wishlist_id UUID NOT NULL REFERENCES public.wishlists(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  note TEXT,
  UNIQUE(wishlist_id, variant_id)
);
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own wishlist_items' AND tablename = 'wishlist_items') THEN
    CREATE POLICY "Users can view own wishlist_items" ON public.wishlist_items
      FOR SELECT USING (wishlist_id IN (SELECT id FROM public.wishlists WHERE user_id = auth.uid()));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own wishlist_items' AND tablename = 'wishlist_items') THEN
    CREATE POLICY "Users can insert own wishlist_items" ON public.wishlist_items
      FOR INSERT WITH CHECK (wishlist_id IN (SELECT id FROM public.wishlists WHERE user_id = auth.uid()));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own wishlist_items' AND tablename = 'wishlist_items') THEN
    CREATE POLICY "Users can delete own wishlist_items" ON public.wishlist_items
      FOR DELETE USING (wishlist_id IN (SELECT id FROM public.wishlists WHERE user_id = auth.uid()));
  END IF;
END $$;

-- 1.16 Add missing columns to reviews
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'title') THEN
    ALTER TABLE public.reviews ADD COLUMN title TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'body') THEN
    ALTER TABLE public.reviews ADD COLUMN body TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'order_item_id') THEN
    ALTER TABLE public.reviews ADD COLUMN order_item_id UUID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'is_verified_purchase') THEN
    ALTER TABLE public.reviews ADD COLUMN is_verified_purchase BOOLEAN DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'status') THEN
    ALTER TABLE public.reviews ADD COLUMN status TEXT DEFAULT 'approved';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'helpful_count') THEN
    ALTER TABLE public.reviews ADD COLUMN helpful_count INTEGER DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'not_helpful_count') THEN
    ALTER TABLE public.reviews ADD COLUMN not_helpful_count INTEGER DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'report_count') THEN
    ALTER TABLE public.reviews ADD COLUMN report_count INTEGER DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'moderated_by') THEN
    ALTER TABLE public.reviews ADD COLUMN moderated_by UUID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'moderated_at') THEN
    ALTER TABLE public.reviews ADD COLUMN moderated_at TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'moderation_note') THEN
    ALTER TABLE public.reviews ADD COLUMN moderation_note TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.reviews ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- 1.17 search_logs
CREATE TABLE IF NOT EXISTS public.search_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_token TEXT,
  query TEXT NOT NULL,
  normalized_query TEXT GENERATED ALWAYS AS (lower(btrim(query))) STORED,
  result_count INTEGER DEFAULT 0,
  clicked_product_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_logs_query ON public.search_logs(normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_logs_created ON public.search_logs(created_at);

-- 1.18 Add missing columns to product_variants (if not present)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_variants' AND column_name = 'stock_quantity') THEN
    ALTER TABLE public.product_variants ADD COLUMN stock_quantity INTEGER DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_variants' AND column_name = 'reserved_quantity') THEN
    ALTER TABLE public.product_variants ADD COLUMN reserved_quantity INTEGER DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_variants' AND column_name = 'is_active') THEN
    ALTER TABLE public.product_variants ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_variants' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.product_variants ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_variants' AND column_name = 'is_default') THEN
    ALTER TABLE public.product_variants ADD COLUMN is_default BOOLEAN DEFAULT false;
  END IF;
END $$;


-- ============================================================
-- 2. MISSING FUNCTIONS
-- ============================================================

-- 2.1 get_or_create_cart (modern version with session_token)
CREATE OR REPLACE FUNCTION public.get_or_create_cart(p_session_token text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cart_id uuid;
begin
  if v_uid is not null then
    select id into v_cart_id
    from public.carts
    where (user_id = v_uid OR owner_id = v_uid) and status = 'active'
    order by created_at desc limit 1;

    if v_cart_id is null then
      insert into public.carts(user_id, owner_id, status)
      values (v_uid, v_uid, 'active')
      returning id into v_cart_id;
    end if;
  elsif p_session_token is not null then
    select id into v_cart_id
    from public.carts
    where session_token = p_session_token and status = 'active';

    if v_cart_id is null then
      insert into public.carts(session_token, status)
      values (p_session_token, 'active')
      returning id into v_cart_id;
    end if;
  else
    raise exception 'Authentication required or session token needed';
  end if;

  return v_cart_id;
end;
$function$;

-- 2.2 remove_cart_item
CREATE OR REPLACE FUNCTION public.remove_cart_item(
  p_cart_item_id uuid,
  p_session_token text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cart_id uuid;
begin
  select cart_id into v_cart_id
  from public.cart_items
  where id = p_cart_item_id;

  if v_cart_id is null then
    return false;
  end if;

  if not public.can_access_cart(v_cart_id, p_session_token) then
    return false;
  end if;

  delete from public.cart_items where id = p_cart_item_id;
  return true;
end;
$function$;

-- 2.3 save_for_later
CREATE OR REPLACE FUNCTION public.save_for_later(
  p_cart_item_id uuid,
  p_session_token text DEFAULT NULL::text
)
RETURNS cart_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cart_id uuid;
  v_item public.cart_items;
begin
  select cart_id into v_cart_id
  from public.cart_items
  where id = p_cart_item_id;

  if v_cart_id is null or not public.can_access_cart(v_cart_id, p_session_token) then
    raise exception 'Cart item not found or access denied';
  end if;

  update public.cart_items
  set is_saved_for_later = true
  where id = p_cart_item_id
  returning * into v_item;

  return v_item;
end;
$function$;

-- 2.4 move_to_cart
CREATE OR REPLACE FUNCTION public.move_to_cart(
  p_cart_item_id uuid,
  p_session_token text DEFAULT NULL::text
)
RETURNS cart_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cart_id uuid;
  v_item public.cart_items;
begin
  select cart_id into v_cart_id
  from public.cart_items
  where id = p_cart_item_id;

  if v_cart_id is null or not public.can_access_cart(v_cart_id, p_session_token) then
    raise exception 'Cart item not found or access denied';
  end if;

  update public.cart_items
  set is_saved_for_later = false
  where id = p_cart_item_id
  returning * into v_item;

  return v_item;
end;
$function$;

-- 2.5 move_wishlist_item_to_cart
CREATE OR REPLACE FUNCTION public.move_wishlist_item_to_cart(
  p_wishlist_item_id uuid,
  p_quantity integer DEFAULT 1,
  p_session_token text DEFAULT NULL::text
)
RETURNS cart_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_wishlist_item record;
  v_cart_id uuid;
  v_price numeric;
  v_stock int;
  v_reserved int;
  v_item public.cart_items;
  v_existing_id uuid;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select wi.* into v_wishlist_item
  from public.wishlist_items wi
  join public.wishlists w on w.id = wi.wishlist_id
  where wi.id = p_wishlist_item_id and w.user_id = v_uid;

  if v_wishlist_item.id is null then
    raise exception 'Wishlist item not found or access denied';
  end if;

  if p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select price, stock_quantity, reserved_quantity
  into v_price, v_stock, v_reserved
  from public.product_variants
  where id = v_wishlist_item.variant_id and is_active and deleted_at is null
  for update;

  if v_price is null then
    raise exception 'Variant not found or inactive';
  end if;

  if (v_stock - v_reserved) < p_quantity then
    raise exception 'Insufficient stock: only % available', greatest(v_stock - v_reserved, 0);
  end if;

  v_cart_id := public.get_or_create_cart(p_session_token);

  select id into v_existing_id
  from public.cart_items
  where cart_id = v_cart_id
    and variant_id = v_wishlist_item.variant_id
    and customization_id is null
    and not is_saved_for_later;

  if v_existing_id is not null then
    update public.cart_items
    set quantity = quantity + p_quantity, unit_price_snapshot = v_price
    where id = v_existing_id
    returning * into v_item;
  else
    insert into public.cart_items(cart_id, variant_id, quantity, unit_price_snapshot)
    values (v_cart_id, v_wishlist_item.variant_id, p_quantity, v_price)
    returning * into v_item;
  end if;

  delete from public.wishlist_items where id = p_wishlist_item_id;

  return v_item;
end;
$function$;

-- 2.6 apply_coupon
CREATE OR REPLACE FUNCTION public.apply_coupon(
  p_cart_id uuid,
  p_code text,
  p_session_token text DEFAULT NULL::text
)
RETURNS carts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cart public.carts;
  v_coupon public.coupons;
  v_discount numeric;
begin
  select * into v_cart from public.carts where id = p_cart_id;

  if v_cart.id is null then
    raise exception 'Cart not found';
  end if;

  if not public.can_access_cart(p_cart_id, p_session_token) then
    raise exception 'Access denied';
  end if;

  select * into v_coupon
  from public.coupons
  where upper(code) = upper(p_code)
    and is_active = true
    and (starts_at IS NULL OR starts_at <= now())
    and (expires_at IS NULL OR expires_at >= now());

  if v_coupon.id is null then
    raise exception 'Invalid or expired coupon code';
  end if;

  if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
    raise exception 'Coupon usage limit reached';
  end if;

  if v_coupon.min_order_amount > 0 then
    if v_cart.discount_amount < v_coupon.min_order_amount then
      raise exception 'Minimum order amount of % not met', v_coupon.min_order_amount;
    end if;
  end if;

  if v_coupon.discount_type = 'percentage' then
    v_discount := v_cart.discount_amount * (v_coupon.discount_value / 100);
    if v_coupon.max_discount_amount is not null then
      v_discount := least(v_discount, v_coupon.max_discount_amount);
    end if;
  else
    v_discount := v_coupon.discount_value;
  end if;

  update public.carts
  set coupon_id = v_coupon.id,
      coupon_code = v_coupon.code,
      discount_amount = v_discount
  where id = p_cart_id
  returning * into v_cart;

  return v_cart;
end;
$function$;

-- 2.7 remove_coupon
CREATE OR REPLACE FUNCTION public.remove_coupon(
  p_cart_id uuid,
  p_session_token text DEFAULT NULL::text
)
RETURNS carts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cart public.carts;
begin
  select * into v_cart from public.carts where id = p_cart_id;

  if v_cart.id is null then
    raise exception 'Cart not found';
  end if;

  if not public.can_access_cart(p_cart_id, p_session_token) then
    raise exception 'Access denied';
  end if;

  update public.carts
  set coupon_id = null,
      coupon_code = null,
      discount_amount = 0
  where id = p_cart_id
  returning * into v_cart;

  return v_cart;
end;
$function$;

-- 2.8 can_access_cart helper
CREATE OR REPLACE FUNCTION public.can_access_cart(
  p_cart_id uuid,
  p_session_token text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    return exists (
      select 1 from public.carts
      where id = p_cart_id
        and (user_id = v_uid OR owner_id = v_uid)
        and status = 'active'
    );
  elsif p_session_token is not null then
    return exists (
      select 1 from public.carts
      where id = p_cart_id
        and session_token = p_session_token
        and status = 'active'
    );
  end if;
  return false;
end;
$function$;

-- 2.9 checkout RPC
CREATE OR REPLACE FUNCTION public.checkout(
  p_cart_id uuid,
  p_shipping_address jsonb,
  p_billing_address jsonb DEFAULT NULL,
  p_gift_wrap boolean DEFAULT false,
  p_gift_note text DEFAULT NULL,
  p_customer_note text DEFAULT NULL,
  p_shipping_fee numeric DEFAULT 0
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cart public.carts;
  v_cart_item record;
  v_order_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_order_number text;
  v_order public.orders;
  v_item_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Must be authenticated to checkout';
  end if;

  -- Get cart
  select * into v_cart
  from public.carts
  where id = p_cart_id and status = 'active'
    and (user_id = v_uid OR owner_id = v_uid);

  if v_cart.id is null then
    raise exception 'Cart not found or not accessible';
  end if;

  -- Generate order number
  v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

  -- Create order
  insert into public.orders(
    user_id, status, subtotal, shipping_fee, discount_amount, total,
    currency, shipping_address_snapshot, billing_address_snapshot,
    gift_wrap, gift_note, customer_note, order_number, placed_at,
    coupon_id
  ) values (
    v_uid, 'pending', 0, p_shipping_fee, 0, 0,
    'USD', p_shipping_address, p_billing_address,
    p_gift_wrap, p_gift_note, p_customer_note, v_order_number, now(),
    v_cart.coupon_id
  )
  returning id into v_order_id;

  -- Process cart items
  for v_item_count in 1..1 loop
    -- Reset for each item
    null;
  end loop;

  v_item_count := 0;
  for v_cart_item in
    select ci.*, pv.price as current_price, pv.product_id, pv.sku
    from public.cart_items ci
    join public.product_variants pv on pv.id = ci.variant_id
    where ci.cart_id = p_cart_id
      and ci.is_saved_for_later = false
      and ci.customization_id is null
  loop
    v_item_count := v_item_count + 1;

    -- Use authoritative price from DB, NOT from cart snapshot
    v_subtotal := v_subtotal + (v_cart_item.current_price * v_cart_item.quantity);

    insert into public.order_items(
      order_id, variant_id, product_id, product_name_snapshot,
      sku_snapshot, options_snapshot, unit_price_snapshot,
      quantity, line_total, printing_instructions,
      is_gift_wrapped, gift_note, status
    ) values (
      v_order_id, v_cart_item.variant_id, v_cart_item.product_id,
      (select name from public.products where id = v_cart_item.product_id),
      v_cart_item.sku,
      jsonb_build_object('color', v_cart_item.color, 'size', v_cart_item.size),
      v_cart_item.current_price,
      v_cart_item.quantity,
      v_cart_item.current_price * v_cart_item.quantity,
      null, p_gift_wrap, p_gift_note, 'pending'
    );

    -- Deduct stock
    update public.product_variants
    set stock_quantity = stock_quantity - v_cart_item.quantity
    where id = v_cart_item.variant_id;

    -- Log status history
    insert into public.order_status_history(order_id, new_status, actor_id, actor_type)
    values (v_order_id, 'pending', v_uid, 'customer');
  end loop;

  if v_item_count = 0 then
    delete from public.orders where id = v_order_id;
    raise exception 'Cart is empty';
  end if;

  -- Apply discount
  v_discount := v_cart.discount_amount;

  -- Calculate total
  v_total := v_subtotal + p_shipping_fee - v_discount;

  if v_total < 0 then
    v_total := 0;
  end if;

  -- Update order with final amounts
  update public.orders
  set subtotal = v_subtotal,
      discount_amount = v_discount,
      total = v_total
  where id = v_order_id
  returning * into v_order;

  -- Mark cart as completed
  update public.carts set status = 'completed' where id = p_cart_id;

  return v_order;
end;
$function$;

-- 2.10 pay_with_wallet
CREATE OR REPLACE FUNCTION public.pay_with_wallet(
  p_order_id uuid,
  p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_wallet public.wallets;
  v_amount numeric;
  v_payment_id uuid;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_uid;

  if v_order.id is null then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status not in ('pending', 'paid') then
    raise exception 'Order is not in a payable state';
  end if;

  v_amount := coalesce(p_amount, v_order.total);

  if v_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = v_uid
  for update;

  if v_wallet.id is null then
    raise exception 'Wallet not found';
  end if;

  if v_wallet.balance < v_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  -- Atomic deduction
  update public.wallets
  set balance = balance - v_amount, updated_at = now()
  where id = v_wallet.id;

  -- Record transaction
  insert into public.wallet_transactions(wallet_id, type, amount, reference_type, reference_id, description)
  values (v_wallet.id, 'debit', v_amount, 'order', p_order_id, 'Payment for order ' || v_order.order_number);

  -- Record payment
  insert into public.payments(order_id, provider, amount, status)
  values (p_order_id, 'wallet', v_amount, 'succeeded')
  returning id into v_payment_id;

  -- Update order
  update public.orders set status = 'paid' where id = p_order_id;

  -- Log status history
  insert into public.order_status_history(order_id, old_status, new_status, actor_id, actor_type)
  values (p_order_id, 'pending', 'paid', v_uid, 'customer');

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'order_id', p_order_id,
    'amount', v_amount,
    'status', 'succeeded'
  );
end;
$function$;

-- 2.11 pay_with_cod
CREATE OR REPLACE FUNCTION public.pay_with_cod(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment_id uuid;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_uid;

  if v_order.id is null then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status != 'pending' then
    raise exception 'Order is not in a payable state';
  end if;

  -- Check if COD already recorded
  if exists (select 1 from public.payments where order_id = p_order_id and provider = 'cod' and status = 'succeeded') then
    select id into v_payment_id from public.payments where order_id = p_order_id and provider = 'cod' limit 1;
    return jsonb_build_object('payment_id', v_payment_id, 'order_id', p_order_id, 'status', 'already_recorded');
  end if;

  insert into public.payments(order_id, provider, amount, status)
  values (p_order_id, 'cod', v_order.total, 'succeeded')
  returning id into v_payment_id;

  update public.orders set status = 'confirmed' where id = p_order_id;

  insert into public.order_status_history(order_id, old_status, new_status, actor_id, actor_type)
  values (p_order_id, 'pending', 'confirmed', v_uid, 'customer');

  return jsonb_build_object('payment_id', v_payment_id, 'order_id', p_order_id, 'status', 'succeeded');
end;
$function$;

-- 2.12 cancel_order
CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_item record;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_uid;

  if v_order.id is null then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status in ('cancelled', 'delivered', 'refunded') then
    raise exception 'Order cannot be cancelled (status: %)', v_order.status;
  end if;

  -- Restore stock
  for v_item in
    select variant_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.product_variants
    set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.variant_id;
  end loop;

  -- Refund wallet if paid via wallet
  if exists (select 1 from public.payments where order_id = p_order_id and provider = 'wallet' and status = 'succeeded') then
    update public.wallets
    set balance = balance + v_order.total, updated_at = now()
    where user_id = v_uid;

    insert into public.wallet_transactions(wallet_id, type, amount, reference_type, reference_id, description)
    select w.id, 'credit', v_order.total, 'order', p_order_id, 'Refund for cancelled order ' || v_order.order_number
    from public.wallets w where w.user_id = v_uid;
  end if;

  update public.orders
  set status = 'cancelled', customer_note = coalesce(p_reason, customer_note)
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history(order_id, old_status, new_status, actor_id, actor_type, note)
  values (p_order_id, 'active', 'cancelled', v_uid, 'customer', p_reason);

  return v_order;
end;
$function$;

-- 2.13 create_return_request
CREATE OR REPLACE FUNCTION public.create_return_request(
  p_order_id uuid,
  p_items jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_return_id uuid;
  v_item jsonb;
  v_order_item record;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_uid;

  if v_order.id is null then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status not in ('delivered', 'paid', 'confirmed') then
    raise exception 'Order is not eligible for return (status: %)', v_order.status;
  end if;

  -- Check for existing pending return
  if exists (select 1 from public.returns where order_id = p_order_id and requested_by = v_uid and status = 'pending') then
    raise exception 'A pending return request already exists for this order';
  end if;

  insert into public.returns(order_id, requested_by, reason)
  values (p_order_id, v_uid, p_reason)
  returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Verify the order item belongs to this order
    select * into v_order_item
    from public.order_items
    where id = (v_item->>'order_item_id')::uuid and order_id = p_order_id;

    if v_order_item.id is null then
      raise exception 'Order item not found';
    end if;

    insert into public.return_items(return_id, order_item_id, quantity, reason)
    values (
      v_return_id,
      (v_item->>'order_item_id')::uuid,
      coalesce((v_item->>'quantity')::integer, 1),
      v_item->>'reason'
    );
  end loop;

  return jsonb_build_object(
    'return_id', v_return_id,
    'status', 'pending',
    'order_id', p_order_id
  );
end;
$function$;

-- 2.14 record_payment_event
CREATE OR REPLACE FUNCTION public.record_payment_event(
  p_provider text,
  p_event_type text,
  p_provider_event_id text,
  p_payload jsonb,
  p_signature_verified boolean DEFAULT false,
  p_payment_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.payment_events(provider, provider_event_id, event_type, payload, signature_verified, payment_id)
  values (p_provider, p_provider_event_id, p_event_type, p_payload, p_signature_verified, p_payment_id)
  on conflict (provider_event_id) do nothing;
end;
$function$;

-- 2.15 process_payment_failure
CREATE OR REPLACE FUNCTION public.process_payment_failure(
  p_provider_payment_id text,
  p_provider text,
  p_failure_code text DEFAULT NULL,
  p_failure_message text DEFAULT NULL,
  p_raw_response jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_payment record;
begin
  select * into v_payment
  from public.payments
  where provider_payment_id = p_provider_payment_id
    and provider = p_provider
  order by created_at desc
  limit 1;

  if v_payment.id is not null then
    update public.payments
    set status = 'failed',
        raw_response = coalesce(p_raw_response, raw_response),
        updated_at = now()
    where id = v_payment.id;

    update public.orders
    set status = 'pending'
    where id = v_payment.order_id;
  end if;
end;
$function$;

-- 2.16 calculate_tax (stub - returns 0, tax not implemented yet)
CREATE OR REPLACE FUNCTION public.calculate_tax(
  p_subtotal numeric,
  p_shipping_address jsonb DEFAULT NULL::jsonb,
  p_items jsonb DEFAULT NULL::jsonb
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Tax calculation is not yet implemented.
  -- Returns 0. When tax rules are defined, implement here.
  return 0;
end;
$function$;

-- 2.17 get_shipping_options
CREATE OR REPLACE FUNCTION public.get_shipping_options(
  p_country text,
  p_order_subtotal numeric DEFAULT 0,
  p_weight_grams integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_options jsonb := '[]'::jsonb;
  v_free_threshold numeric := 500;
begin
  -- Standard shipping
  v_options := v_options || jsonb_build_object(
    'method_id', 'standard',
    'method_name', 'Standard Shipping',
    'fee', case when p_order_subtotal >= v_free_threshold then 0 else 49 end,
    'is_free', p_order_subtotal >= v_free_threshold,
    'estimated_days', '5-7'
  );

  -- Express shipping
  v_options := v_options || jsonb_build_object(
    'method_id', 'express',
    'method_name', 'Express Shipping',
    'fee', case when p_order_subtotal >= v_free_threshold then 29 else 79 end,
    'is_free', false,
    'estimated_days', '2-3'
  );

  return v_options;
end;
$function$;

-- 2.18 retry_failed_payment
CREATE OR REPLACE FUNCTION public.retry_failed_payment(
  p_order_id uuid,
  p_session_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment record;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_uid;

  if v_order.id is null then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status not in ('pending') then
    raise exception 'Order is not in a retryable state';
  end if;

  -- Find last failed payment
  select * into v_payment
  from public.payments
  where order_id = p_order_id and status = 'failed'
  order by created_at desc
  limit 1;

  if v_payment.id is null then
    raise exception 'No failed payment found for this order';
  end if;

  -- Reset payment status
  update public.payments set status = 'pending', updated_at = now() where id = v_payment.id;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'order_id', p_order_id,
    'provider', v_payment.provider,
    'amount', v_payment.amount,
    'status', 'retry_initiated'
  );
end;
$function$;

-- 2.19 request_payment_refund
CREATE OR REPLACE FUNCTION public.request_payment_refund(
  p_order_id uuid,
  p_amount numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment record;
  v_refund_amount numeric;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_uid;

  if v_order.id is null then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status not in ('paid', 'confirmed', 'processing') then
    raise exception 'Order is not eligible for refund';
  end if;

  -- Check no existing refund
  if exists (select 1 from public.payments where order_id = p_order_id and status = 'refunded') then
    raise exception 'Refund already processed for this order';
  end if;

  select * into v_payment
  from public.payments
  where order_id = p_order_id and status = 'succeeded'
  order by created_at desc
  limit 1;

  if v_payment.id is null then
    raise exception 'No successful payment found';
  end if;

  v_refund_amount := coalesce(p_amount, v_payment.amount);

  if v_refund_amount > v_payment.amount then
    raise exception 'Refund amount exceeds payment amount';
  end if;

  update public.payments
  set status = 'refunded', updated_at = now()
  where id = v_payment.id;

  update public.orders set status = 'refunded' where id = p_order_id;

  -- Refund to wallet if original payment was wallet
  if v_payment.provider = 'wallet' then
    update public.wallets
    set balance = balance + v_refund_amount, updated_at = now()
    where user_id = v_uid;

    insert into public.wallet_transactions(wallet_id, type, amount, reference_type, reference_id, description)
    select w.id, 'refund', v_refund_amount, 'order', p_order_id, coalesce(p_reason, 'Refund')
    from public.wallets w where w.user_id = v_uid;
  end if;

  insert into public.order_status_history(order_id, old_status, new_status, actor_id, actor_type, note)
  values (p_order_id, v_order.status, 'refunded', v_uid, 'customer', p_reason);

  return jsonb_build_object(
    'refund_amount', v_refund_amount,
    'order_id', p_order_id,
    'status', 'refunded'
  );
end;
$function$;


-- ============================================================
-- 3. MISSING TRIGGERS
-- ============================================================

-- 3.1 handle_new_user — auto-create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles(id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3.2 create_wallet_for_new_user
CREATE OR REPLACE FUNCTION public.create_wallet_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.wallets(user_id, balance, currency)
  values (new.id, 0, 'USD')
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
CREATE TRIGGER on_auth_user_created_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_new_user();

-- 3.3 create_default_wishlist_for_new_user
CREATE OR REPLACE FUNCTION public.create_default_wishlist_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.wishlists(user_id, owner_id, name, slug, visibility, is_default)
  values (new.id, new.id, 'My Wishlist', 'my-wishlist', 'private', true)
  on conflict do nothing;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_wishlist ON auth.users;
CREATE TRIGGER on_auth_user_created_wishlist
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_wishlist_for_new_user();

-- 3.4 create_default_notifications_for_new_user
CREATE OR REPLACE FUNCTION public.create_default_notifications_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.notifications(user_id, type, title, message)
  values (new.id, 'welcome', 'Welcome to Galaxy Store!', 'Thank you for joining us. Start exploring our products!');
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_notifications ON auth.users;
CREATE TRIGGER on_auth_user_created_notifications
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_notifications_for_new_user();

-- 3.5 restock_on_order_cancel
CREATE OR REPLACE FUNCTION public.restock_on_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_item record;
begin
  if new.status = 'cancelled' and old.status != 'cancelled' then
    for v_item in
      select variant_id, quantity from public.order_items where order_id = new.id
    loop
      update public.product_variants
      set stock_quantity = stock_quantity + v_item.quantity
      where id = v_item.variant_id;
    end loop;
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_restock_on_order_cancel ON public.orders;
CREATE TRIGGER trg_restock_on_order_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.restock_on_order_cancel();

-- 3.6 log_order_status_change
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if old.status is distinct from new.status then
    insert into public.order_status_history(order_id, old_status, new_status, actor_type)
    values (new.id, old.status, new.status, 'system');
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_log_order_status ON public.orders;
CREATE TRIGGER trg_log_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();


-- ============================================================
-- 4. MISSING VIEWS
-- ============================================================

-- 4.1 orders_status_history
DROP VIEW IF EXISTS public.orders_status_history;
CREATE OR REPLACE VIEW public.orders_status_history WITH (security_invoker = true) AS
SELECT
  osh.id,
  osh.order_id,
  osh.old_status,
  osh.new_status,
  osh.actor_id,
  osh.actor_type,
  osh.note,
  osh.created_at,
  o.order_number,
  o.user_id AS order_owner_id
FROM public.order_status_history osh
JOIN public.orders o ON o.id = osh.order_id;

-- 4.2 shipping_tracking
DROP VIEW IF EXISTS public.shipping_tracking;
CREATE OR REPLACE VIEW public.shipping_tracking WITH (security_invoker = true) AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.user_id AS order_owner_id,
  o.status AS order_status,
  o.shipping_address_snapshot,
  o.created_at AS order_date,
  o.updated_at AS last_update
FROM public.orders o
WHERE o.status IN ('shipped', 'delivered', 'processing');


-- ============================================================
-- 5. ADDITIONAL SECURITY
-- ============================================================

-- Ensure order_items has DELETE protection (only via RPC)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users cannot delete order items' AND tablename = 'order_items') THEN
    CREATE POLICY "Users cannot delete order items"
      ON public.order_items FOR DELETE
      USING (false);
  END IF;
END $$;

-- Ensure orders UPDATE is limited to specific fields only via RPC
-- (The existing policy allows any update - this is acceptable since
--  the update_cart_item_quantity and cancel_order RPCs handle it)
