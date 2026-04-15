-- Align audit_logs with client error-tracking payloads.
-- Safe and idempotent for environments that already added these columns.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS changes jsonb;