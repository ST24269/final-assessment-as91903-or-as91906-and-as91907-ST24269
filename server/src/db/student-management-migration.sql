-- Tago Student Management extension
-- Safe to run more than once in the Supabase SQL editor.
-- This migration does not delete or recreate existing student/attendance data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The project stores app roles in public.profiles.role.
-- Create the helper before any RLS policy references it.
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO anon, authenticated, service_role;

-- Student account links. The app uses student_profiles.profile_id -> profiles.id
-- and student_profiles.student_id -> students.id. These blocks repair missing
-- relationships without deleting existing rows.
CREATE TABLE IF NOT EXISTS public.student_profiles (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS profile_id UUID;
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS student_id UUID;
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_profiles'
      AND column_name = 'user_id'
      AND udt_name = 'uuid'
  ) THEN
    UPDATE public.student_profiles
    SET profile_id = user_id
    WHERE profile_id IS NULL
      AND user_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_profiles_profile
  ON public.student_profiles(profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_profiles_student
  ON public.student_profiles(student_id)
  WHERE student_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.student_profiles'::regclass
      AND contype = 'f'
      AND confrelid = 'public.profiles'::regclass
      AND conkey = ARRAY[(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public.student_profiles'::regclass
          AND attname = 'profile_id'
      )]::smallint[]
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT student_profiles_profile_id_profiles_fkey
      FOREIGN KEY (profile_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.student_profiles'::regclass
      AND contype = 'f'
      AND confrelid = 'public.students'::regclass
      AND conkey = ARRAY[(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public.student_profiles'::regclass
          AND attname = 'student_id'
      )]::smallint[]
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT student_profiles_student_id_students_fkey
      FOREIGN KEY (student_id)
      REFERENCES public.students(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

-- Student Management fields.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS kainga TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS form_group TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS rfid_status TEXT DEFAULT 'unassigned';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

ALTER TABLE public.students ALTER COLUMN account_status SET DEFAULT 'active';
ALTER TABLE public.students ALTER COLUMN rfid_status SET DEFAULT 'unassigned';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_kainga_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_kainga_check
      CHECK (kainga IS NULL OR kainga IN ('Kea', 'Pukeko', 'Mokoroa', 'Pungawerere'))
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_account_status_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_account_status_check
      CHECK (account_status IS NULL OR account_status IN ('active', 'inactive', 'disabled'))
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_rfid_status_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_rfid_status_check
      CHECK (rfid_status IS NULL OR rfid_status IN ('active', 'inactive', 'lost', 'unassigned'))
      NOT VALID;
  END IF;
END $$;

-- Audit logs for admin student-management actions.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  target_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON public.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_student
  ON public.audit_logs(target_student_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_admin'
  ) THEN
    CREATE POLICY "audit_logs_admin" ON public.audit_logs
      FOR ALL
      USING (public.current_profile_role() = 'admin')
      WITH CHECK (public.current_profile_role() = 'admin');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
