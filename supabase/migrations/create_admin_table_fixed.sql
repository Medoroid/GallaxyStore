-- Galaxy Store: Admin System (Fixed)
-- Run this SQL in your Supabase SQL Editor

-- 1. Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if any
DROP POLICY IF EXISTS "Admins can view admin_users" ON admin_users;

-- 4. RLS Policies - Allow authenticated users to check their own admin status
CREATE POLICY "Users can check own admin status"
  ON admin_users FOR SELECT
  USING (auth.uid() = user_id);

-- 5. Allow service role to do everything
CREATE POLICY "Service role full access"
  ON admin_users FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Add your admin user
-- First find your user ID by running this query:
-- SELECT id, email FROM auth.users WHERE email = 'admin@galaxystore.test';

-- Then insert (replace the UUID with your actual user_id):
-- INSERT INTO admin_users (user_id, role) VALUES ('YOUR_USER_UUID', 'super_admin')
-- ON CONFLICT (user_id) DO NOTHING;

-- Or run this automatic version:
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
