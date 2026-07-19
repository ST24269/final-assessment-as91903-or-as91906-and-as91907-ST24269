-- =====================================================
-- READER MANAGEMENT & OFFLINE SUPPORT MIGRATION
-- =====================================================

-- 1. Add new columns to readers table
ALTER TABLE readers
ADD COLUMN IF NOT EXISTS firmware_version TEXT DEFAULT '1.0.0',
ADD COLUMN IF NOT EXISTS last_scan TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS online_status TEXT DEFAULT 'offline' CHECK (online_status IN ('online', 'offline', 'degraded')),
ADD COLUMN IF NOT EXISTS mac_address TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- 2. Create offline_scans cache table
-- Stores scans when reader loses connectivity
CREATE TABLE IF NOT EXISTS offline_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reader_id UUID NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  rfid_card_uid TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL,  -- Preserved original timestamp
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  upload_attempts INT DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'failed')),
  server_response JSONB,
  UNIQUE(reader_id, rfid_card_uid, scanned_at)
);

-- 3. Create scan_logs table for detailed logging
CREATE TABLE IF NOT EXISTS scan_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reader_id UUID NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  rfid_card_uid TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'duplicate', 'invalid_card', 'no_session', 'not_enrolled', 'reader_inactive', 'error')),
  processing_time_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_offline_scans_reader ON offline_scans(reader_id);
CREATE INDEX IF NOT EXISTS idx_offline_scans_status ON offline_scans(status);
CREATE INDEX IF NOT EXISTS idx_scan_logs_reader ON scan_logs(reader_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_created ON scan_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at);

-- 5. Enable RLS on new tables
ALTER TABLE offline_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies for offline_scans (admin only for web access)
CREATE POLICY "offline_scans_admin" ON offline_scans
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

-- 7. RLS policies for scan_logs (admin only for web access)
CREATE POLICY "scan_logs_admin" ON scan_logs
  FOR ALL USING (current_profile_role() = 'admin')
  WITH CHECK (current_profile_role() = 'admin');

-- 8. Add function to get today's scan count per reader
CREATE OR REPLACE FUNCTION get_reader_today_scan_count(reader_uuid UUID)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM scan_logs
  WHERE reader_id = reader_uuid
    AND scanned_at >= CURRENT_DATE
    AND result = 'success';
$$;

-- 9. Add function to check reader status
CREATE OR REPLACE FUNCTION get_reader_status(reader_uuid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN last_seen IS NULL THEN 'offline'
      WHEN AGE(NOW(), last_seen) > INTERVAL '5 minutes' THEN 'offline'
      WHEN AGE(NOW(), last_seen) > INTERVAL '1 minute' THEN 'degraded'
      ELSE 'online'
    END
  FROM readers
  WHERE id = reader_uuid;
$$;