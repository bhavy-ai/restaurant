-- Ensure audit_logs supports severity in all environments.
-- Prevents PGRST204 errors when clients send severity.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'audit_severity_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.audit_severity_enum AS ENUM ('info', 'warning', 'critical');
  END IF;
END
$$;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS severity public.audit_severity_enum;

UPDATE public.audit_logs
SET severity = 'info'
WHERE severity IS NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN severity SET DEFAULT 'info';