-- Migration: Add error_tracking support to audit_logs
-- Ensures audit_logs table has the columns needed for client-side error tracking

DO $$
BEGIN
  -- Add outlet column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'outlet'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN outlet text;
  END IF;

  -- Add entity_type column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN entity_type text;
  END IF;

  -- Add entity_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN entity_id uuid;
  END IF;

  -- Add performed_by column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'performed_by'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN performed_by text DEFAULT 'system';
  END IF;
END $$;

-- Create index on action for fast error log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs(entity_type);
