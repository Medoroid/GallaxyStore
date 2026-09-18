-- Galaxy Store: Create admin_users table (secure version)
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Users can check their own admin status
DROP POLICY IF EXISTS "Users can check own admin status" ON admin_users;
CREATE POLICY "Users can check own admin status"
  ON admin_users FOR SELECT
  USING (auth.uid() = user_id);

-- Only existing admins can manage admin_users
DROP POLICY IF EXISTS "Admins can manage admin_users" ON admin_users;
CREATE POLICY "Admins can manage admin_users"
  ON admin_users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add your admin user
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@galaxystore.test' LIMIT 1;
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO admin_users (user_id, role) VALUES (admin_user_id, 'super_admin')
    ON CONFLICT (user_id) DO NOTHING;
    RAISE NOTICE 'Admin user added successfully with ID: %', admin_user_id;
  ELSE
    RAISE NOTICE 'User admin@galaxystore.test not found. Please register first.';
  END IF;
END $$;
