-- AttendRFID appeals and timetable extension
-- Safe to run more than once in the Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS kainga TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS form_group TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS la_teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

CREATE INDEX IF NOT EXISTS idx_students_kainga ON public.students(kainga);
CREATE INDEX IF NOT EXISTS idx_students_la_teacher ON public.students(la_teacher_id);

CREATE TABLE IF NOT EXISTS public.timetable_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject TEXT,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_number INT CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 20),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT timetable_periods_time_check CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS public.attendance_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES public.attendance(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  appeal_date DATE NOT NULL,
  current_status TEXT CHECK (current_status IS NULL OR current_status IN ('present', 'late', 'absent', 'excused')),
  requested_status TEXT CHECK (requested_status IS NULL OR requested_status IN ('present', 'late', 'absent', 'excused')),
  reason TEXT NOT NULL,
  comments TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'resolved')),
  teacher_response TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  notification_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS class_id UUID;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS student_id UUID;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS teacher_id UUID;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS day_of_week INT;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS period_number INT;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS room TEXT;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.timetable_periods ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS student_id UUID;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS attendance_id UUID;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS class_id UUID;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS appeal_date DATE;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS current_status TEXT;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS requested_status TEXT;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS comments TEXT;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS teacher_response TEXT;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS created_by_profile_id UUID;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS decided_by_profile_id UUID;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS notification_error TEXT;
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.attendance_appeals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timetable_periods_class_id_fkey'
      AND conrelid = 'public.timetable_periods'::regclass
  ) THEN
    ALTER TABLE public.timetable_periods
      ADD CONSTRAINT timetable_periods_class_id_fkey
      FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timetable_periods_student_id_fkey'
      AND conrelid = 'public.timetable_periods'::regclass
  ) THEN
    ALTER TABLE public.timetable_periods
      ADD CONSTRAINT timetable_periods_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timetable_periods_teacher_id_fkey'
      AND conrelid = 'public.timetable_periods'::regclass
  ) THEN
    ALTER TABLE public.timetable_periods
      ADD CONSTRAINT timetable_periods_teacher_id_fkey
      FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timetable_periods_day_of_week_check'
      AND conrelid = 'public.timetable_periods'::regclass
  ) THEN
    ALTER TABLE public.timetable_periods
      ADD CONSTRAINT timetable_periods_day_of_week_check
      CHECK (day_of_week BETWEEN 1 AND 7)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timetable_periods_period_number_check'
      AND conrelid = 'public.timetable_periods'::regclass
  ) THEN
    ALTER TABLE public.timetable_periods
      ADD CONSTRAINT timetable_periods_period_number_check
      CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 20)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timetable_periods_time_check'
      AND conrelid = 'public.timetable_periods'::regclass
  ) THEN
    ALTER TABLE public.timetable_periods
      ADD CONSTRAINT timetable_periods_time_check
      CHECK (end_time > start_time)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_student_id_fkey'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_attendance_id_fkey'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_attendance_id_fkey
      FOREIGN KEY (attendance_id) REFERENCES public.attendance(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_session_id_fkey'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_class_id_fkey'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_class_id_fkey
      FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_created_by_profile_id_fkey'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_created_by_profile_id_fkey
      FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_decided_by_profile_id_fkey'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_decided_by_profile_id_fkey
      FOREIGN KEY (decided_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_current_status_check'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_current_status_check
      CHECK (current_status IS NULL OR current_status IN ('present', 'late', 'absent', 'excused'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_requested_status_check'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_requested_status_check
      CHECK (requested_status IS NULL OR requested_status IN ('present', 'late', 'absent', 'excused'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_appeals_status_check'
      AND conrelid = 'public.attendance_appeals'::regclass
  ) THEN
    ALTER TABLE public.attendance_appeals
      ADD CONSTRAINT attendance_appeals_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'resolved'))
      NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_timetable_periods_updated_at ON public.timetable_periods;
CREATE TRIGGER set_timetable_periods_updated_at
BEFORE UPDATE ON public.timetable_periods
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_attendance_appeals_updated_at ON public.attendance_appeals;
CREATE TRIGGER set_attendance_appeals_updated_at
BEFORE UPDATE ON public.attendance_appeals
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_classes_updated_at ON public.classes;
CREATE TRIGGER set_classes_updated_at
BEFORE UPDATE ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_timetable_periods_class ON public.timetable_periods(class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_student ON public.timetable_periods(student_id);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_teacher ON public.timetable_periods(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_day_time ON public.timetable_periods(day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_student ON public.attendance_appeals(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_class ON public.attendance_appeals(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_status ON public.attendance_appeals(status);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_date ON public.attendance_appeals(appeal_date DESC);

ALTER TABLE public.timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_appeals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'timetable_periods'
      AND policyname = 'timetable_admin_all'
  ) THEN
    CREATE POLICY "timetable_admin_all" ON public.timetable_periods
      FOR ALL
      USING (public.current_profile_role() = 'admin')
      WITH CHECK (public.current_profile_role() = 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'timetable_periods'
      AND policyname = 'timetable_teacher_read'
  ) THEN
    CREATE POLICY "timetable_teacher_read" ON public.timetable_periods
      FOR SELECT
      USING (
        public.current_profile_role() IN ('teacher', 'admin')
        OR EXISTS (
          SELECT 1
          FROM public.enrolments e
          JOIN public.student_profiles sp ON sp.student_id = e.student_id
          WHERE e.class_id = timetable_periods.class_id
            AND sp.profile_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.student_profiles sp
          WHERE sp.student_id = timetable_periods.student_id
            AND sp.profile_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_appeals'
      AND policyname = 'appeals_student_read'
  ) THEN
    CREATE POLICY "appeals_student_read" ON public.attendance_appeals
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.student_profiles sp
          WHERE sp.profile_id = auth.uid()
            AND sp.student_id = attendance_appeals.student_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_appeals'
      AND policyname = 'appeals_student_insert'
  ) THEN
    CREATE POLICY "appeals_student_insert" ON public.attendance_appeals
      FOR INSERT
      WITH CHECK (
        public.current_profile_role() = 'student'
        AND created_by_profile_id = auth.uid()
        AND status = 'pending'
        AND EXISTS (
          SELECT 1
          FROM public.student_profiles sp
          WHERE sp.profile_id = auth.uid()
            AND sp.student_id = attendance_appeals.student_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_appeals'
      AND policyname = 'appeals_staff_read'
  ) THEN
    CREATE POLICY "appeals_staff_read" ON public.attendance_appeals
      FOR SELECT
      USING (
        public.current_profile_role() = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.classes c
          WHERE c.id = attendance_appeals.class_id
            AND c.teacher_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.id = attendance_appeals.student_id
            AND s.la_teacher_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_appeals'
      AND policyname = 'appeals_staff_update'
  ) THEN
    CREATE POLICY "appeals_staff_update" ON public.attendance_appeals
      FOR UPDATE
      USING (
        public.current_profile_role() = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.classes c
          WHERE c.id = attendance_appeals.class_id
            AND c.teacher_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.id = attendance_appeals.student_id
            AND s.la_teacher_id = auth.uid()
        )
      )
      WITH CHECK (
        public.current_profile_role() IN ('teacher', 'admin')
      );
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
