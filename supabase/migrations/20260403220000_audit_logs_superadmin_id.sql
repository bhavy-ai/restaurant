-- Migration: Add superadmin_id column to audit_logs for superadmin action tracking
-- 20260403220000_audit_logs_superadmin_id.sql

DO $$
BEGIN
  -- Add superadmin_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'superadmin_id'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN superadmin_id UUID;
  END IF;

  -- Add is_active column to platform_superadmins if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_superadmins' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.platform_superadmins ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- Index for fast superadmin audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_superadmin_id ON public.audit_logs(superadmin_id);
