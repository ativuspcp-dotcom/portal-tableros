-- ==========================================
-- PORTAL TABLEROS — DATABASE SCHEMA & SEED
-- ==========================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. user_profiles ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'user')),
  department TEXT,
  job_title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  avatar_url TEXT,
  last_sign_in TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ── 2. modules ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

-- ── 3. user_module_permissions ───────────────────────────
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT FALSE,
  can_create BOOLEAN DEFAULT FALSE,
  can_edit BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  granted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, module_id)
);

-- Enable RLS
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- ── 4. activity_log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  module TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;


-- ── 5. triggers & functions ──────────────────────────────

-- Automatically update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, email, role, department, job_title, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'department',
    NEW.raw_user_meta_data->>'job_title',
    COALESCE(NEW.raw_user_meta_data->>'status', 'active')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 6. RLS Policies ──────────────────────────────────────

-- user_profiles Policies
CREATE POLICY "Allow public read-access to profiles"
  ON public.user_profiles FOR SELECT
  USING (true);

CREATE POLICY "Allow users to update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Allow admins to insert/update profiles"
  ON public.user_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- modules Policies
CREATE POLICY "Allow public read-access to modules"
  ON public.modules FOR SELECT
  USING (true);

CREATE POLICY "Allow admins to manage modules"
  ON public.modules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- user_module_permissions Policies
CREATE POLICY "Allow users to read their own permissions"
  ON public.user_module_permissions FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Allow admins to manage permissions"
  ON public.user_module_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- activity_log Policies
CREATE POLICY "Allow admins to view activity log"
  ON public.activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Allow authenticated users to write activity log"
  ON public.activity_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);


-- ── 7. Seed Initial Data ─────────────────────────────────

-- Insert modules
INSERT INTO public.modules (name, slug, description, icon, sort_order)
VALUES 
  ('Administração', 'admin', 'Gestão de usuários, permissões e configurações', '⚙️', 1),
  ('Transportes', 'transportes', 'Gestão de transportes e logística', '🚚', 2),
  ('Expedição', 'expedicao', 'Controle de expedição e despacho', '📦', 3)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon;
