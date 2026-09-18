-- Optimize RLS policies: replace auth.uid() with (select auth.uid())
-- This evaluates once per query instead of once per row (Supabase recommended)

-- 1. admin_users: "Users can check own admin status"
DROP POLICY IF EXISTS "Users can check own admin status" ON public.admin_users;
CREATE POLICY "Users can check own admin status"
  ON public.admin_users FOR SELECT
  USING ((select auth.uid()) = user_id);

-- 2. admin_users: "Admins can manage admin_users"
DROP POLICY IF EXISTS "Admins can manage admin_users" ON public.admin_users;
CREATE POLICY "Admins can manage admin_users"
  ON public.admin_users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'admin'::app_role
    )
  );

-- 3. gallery_images: "Admins can update gallery images"
DROP POLICY IF EXISTS "Admins can update gallery images" ON public.gallery_images;
CREATE POLICY "Admins can update gallery images"
  ON public.gallery_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'admin'::app_role
    )
  );

-- 4. gallery_images: "Admins can delete gallery images"
DROP POLICY IF EXISTS "Admins can delete gallery images" ON public.gallery_images;
CREATE POLICY "Admins can delete gallery images"
  ON public.gallery_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'admin'::app_role
    )
  );

-- 5. recently_viewed_products: "recently_viewed_select_owner_or_admin"
DROP POLICY IF EXISTS "recently_viewed_select_owner_or_admin" ON public.recently_viewed_products;
CREATE POLICY "recently_viewed_select_owner_or_admin"
  ON public.recently_viewed_products FOR SELECT
  USING (
    (user_id = (select auth.uid()))
    OR is_admin()
    OR (session_token IS NOT NULL)
  );
