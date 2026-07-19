-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- PROFILES (teachers + admins)
-- ─────────────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'admin', 'student')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- STUDENTS
-- ─────────────────────────────────────────
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  student_number TEXT UNIQUE NOT NULL,
  year_level INT CHECK (year_level BETWEEN 9 AND 13),
  rfid_card_uid TEXT UNIQUE,              -- null until card is assigned
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE student_profiles (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CLASSES
-- ─────────────────────────────────────────
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,                     -- e.g. "12COM", "13SCI"
  subject TEXT NOT NULL,
  room TEXT,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CLASS ENROLMENTS (many-to-many)
-- ─────────────────────────────────────────
CREATE TABLE enrolments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE (class_id, student_id)
);

-- ─────────────────────────────────────────
-- SESSIONS (one per class per period)
-- ─────────────────────────────────────────
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  notes TEXT
);

-- ─────────────────────────────────────────
-- ATTENDANCE RECORDS
-- ─────────────────────────────────────────
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late', 'absent', 'excused')),
  flagged BOOLEAN DEFAULT FALSE,          -- anomaly detection flag
  flag_reason TEXT,                       -- e.g. "scanned twice in 30s"
  manual_override BOOLEAN DEFAULT FALSE,  -- teacher manually changed status
  UNIQUE (session_id, student_id)
);

-- ─────────────────────────────────────────
-- RFID READERS (one per room/ESP32)
-- ─────────────────────────────────────────
CREATE TABLE readers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,                    -- e.g. "Room 14 Reader"
  room TEXT,
  api_key TEXT UNIQUE NOT NULL,           -- ESP32 uses this to authenticate scans
  last_seen TIMESTAMPTZ,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_sessions_class ON sessions(class_id);
CREATE INDEX idx_enrolments_class ON enrolments(class_id);
CREATE INDEX idx_enrolments_student ON enrolments(student_id);
CREATE INDEX idx_students_rfid ON students(rfid_card_uid);
CREATE INDEX idx_student_profiles_student ON student_profiles(student_id);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE readers    ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own, admins can read all
CREATE OR REPLACE FUNCTION current_profile_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE POLICY "profiles_self" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_admin" ON profiles
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

-- Students: staff can read all, students can read their linked record, admins can manage
CREATE POLICY "students_staff_read" ON students
  FOR SELECT USING (current_profile_role() IN ('teacher', 'admin'));

CREATE POLICY "students_self_read" ON students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_profiles sp
      WHERE sp.profile_id = auth.uid()
      AND sp.student_id = students.id
    )
  );

CREATE POLICY "students_admin" ON students
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

-- Student account links
CREATE POLICY "student_profiles_self" ON student_profiles
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "student_profiles_admin" ON student_profiles
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

-- Classes: staff can read all classes for cover lessons, admins manage
CREATE POLICY "classes_staff_read" ON classes
  FOR SELECT USING (current_profile_role() IN ('teacher', 'admin'));

CREATE POLICY "classes_student" ON classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM enrolments e
      JOIN student_profiles sp ON sp.student_id = e.student_id
      WHERE e.class_id = classes.id
      AND sp.profile_id = auth.uid()
    )
  );

CREATE POLICY "classes_admin" ON classes
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

-- Enrolments: staff can read class enrolments, students see their own, admins manage
CREATE POLICY "enrolments_staff_read" ON enrolments
  FOR SELECT USING (current_profile_role() IN ('teacher', 'admin'));

CREATE POLICY "enrolments_student_read" ON enrolments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_profiles sp
      WHERE sp.profile_id = auth.uid()
      AND sp.student_id = enrolments.student_id
    )
  );

CREATE POLICY "enrolments_admin" ON enrolments
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

-- Sessions: teachers can run/cover attendance sessions, admins manage all
CREATE POLICY "sessions_staff_read" ON sessions
  FOR SELECT USING (current_profile_role() IN ('teacher', 'admin'));

CREATE POLICY "sessions_teacher_insert" ON sessions
  FOR INSERT WITH CHECK (
    current_profile_role() = 'teacher'
    AND teacher_id = auth.uid()
  );

CREATE POLICY "sessions_teacher_update" ON sessions
  FOR UPDATE USING (current_profile_role() = 'teacher')
  WITH CHECK (current_profile_role() = 'teacher');

CREATE POLICY "sessions_admin" ON sessions
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

CREATE POLICY "sessions_student_read" ON sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM enrolments e
      JOIN student_profiles sp ON sp.student_id = e.student_id
      WHERE e.class_id = sessions.class_id
      AND sp.profile_id = auth.uid()
    )
  );

-- Attendance: staff can manage attendance records for cover lessons
CREATE POLICY "attendance_staff" ON attendance
  FOR ALL USING (current_profile_role() IN ('teacher', 'admin'))
  WITH CHECK (current_profile_role() IN ('teacher', 'admin'));

CREATE POLICY "attendance_student_read" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_profiles sp
      WHERE sp.profile_id = auth.uid()
      AND sp.student_id = attendance.student_id
    )
  );

-- Readers: admin only
CREATE POLICY "readers_admin" ON readers
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

-- Student Management extensions. These are kept as ALTER statements so existing
-- project databases can add the fields without recreating the students table.
ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS kainga TEXT CHECK (kainga IN ('Kea', 'Pukeko', 'Mokoroa', 'Pungawerere'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS form_group TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS la_teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'inactive', 'disabled'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS rfid_status TEXT DEFAULT 'unassigned' CHECK (rfid_status IN ('active', 'inactive', 'lost', 'unassigned'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  target_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_student ON audit_logs(target_student_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_admin" ON audit_logs;
CREATE POLICY "audit_logs_admin" ON audit_logs
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

CREATE TABLE IF NOT EXISTS timetable_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subject TEXT,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_number INT CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 20),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT timetable_periods_time_check CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS attendance_appeals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES attendance(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  appeal_date DATE NOT NULL,
  current_status TEXT CHECK (current_status IS NULL OR current_status IN ('present', 'late', 'absent', 'excused')),
  requested_status TEXT CHECK (requested_status IS NULL OR requested_status IN ('present', 'late', 'absent', 'excused')),
  reason TEXT NOT NULL,
  comments TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'resolved')),
  teacher_response TEXT,
  created_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  notification_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_kainga ON students(kainga);
CREATE INDEX IF NOT EXISTS idx_students_la_teacher ON students(la_teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_class ON timetable_periods(class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_student ON timetable_periods(student_id);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_teacher ON timetable_periods(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_day_time ON timetable_periods(day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_student ON attendance_appeals(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_class ON attendance_appeals(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_status ON attendance_appeals(status);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_date ON attendance_appeals(appeal_date DESC);

ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timetable_admin_all" ON timetable_periods
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

CREATE POLICY "timetable_read" ON timetable_periods
  FOR SELECT USING (
    current_profile_role() IN ('teacher', 'admin')
    OR EXISTS (
      SELECT 1
      FROM enrolments e
      JOIN student_profiles sp ON sp.student_id = e.student_id
      WHERE e.class_id = timetable_periods.class_id
      AND sp.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM student_profiles sp
      WHERE sp.student_id = timetable_periods.student_id
      AND sp.profile_id = auth.uid()
    )
  );

CREATE POLICY "appeals_student_read" ON attendance_appeals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_profiles sp
      WHERE sp.profile_id = auth.uid()
      AND sp.student_id = attendance_appeals.student_id
    )
  );

CREATE POLICY "appeals_student_insert" ON attendance_appeals
  FOR INSERT WITH CHECK (
    current_profile_role() = 'student'
    AND created_by_profile_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM student_profiles sp
      WHERE sp.profile_id = auth.uid()
      AND sp.student_id = attendance_appeals.student_id
    )
  );

CREATE POLICY "appeals_staff_read" ON attendance_appeals
  FOR SELECT USING (
    current_profile_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = attendance_appeals.class_id
      AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = attendance_appeals.student_id
      AND s.la_teacher_id = auth.uid()
    )
  );

CREATE POLICY "appeals_staff_update" ON attendance_appeals
  FOR UPDATE USING (
    current_profile_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = attendance_appeals.class_id
      AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = attendance_appeals.student_id
      AND s.la_teacher_id = auth.uid()
    )
  )
  WITH CHECK (current_profile_role() IN ('teacher', 'admin'));

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_timetable_periods_updated_at
BEFORE UPDATE ON timetable_periods
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_attendance_appeals_updated_at
BEFORE UPDATE ON attendance_appeals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_classes_updated_at
BEFORE UPDATE ON classes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
