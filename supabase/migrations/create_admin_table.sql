-- Galaxy Store: Admin System
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

-- 3. RLS Policies
CREATE POLICY "Admins can view admin_users"
  ON admin_users FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add your admin user (replace with your actual user ID)
-- First register an account, then run:
-- INSERT INTO admin_users (user_id, role) VALUES ('YOUR_USER_ID', 'super_admin');
