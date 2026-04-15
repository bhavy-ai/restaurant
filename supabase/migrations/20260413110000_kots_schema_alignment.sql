-- Align live kots schema with application payload to avoid PostgREST PGRST204 retries.
-- This makes KOT inserts succeed on first request (no "missing column" failures).

ALTER TABLE public.kots
  ADD COLUMN IF NOT EXISTS order_type text,
  ADD COLUMN IF NOT EXISTS priority text;

-- Backfill safe defaults for existing data.
UPDATE public.kots
SET order_type = CASE
  WHEN table_label = 'TKW' THEN 'takeaway'
  WHEN table_label = 'DEL' THEN 'delivery'
  ELSE 'dine-in'
END
WHERE order_type IS NULL;

UPDATE public.kots
SET priority = 'normal'
WHERE priority IS NULL;

ALTER TABLE public.kots
  ALTER COLUMN order_type SET DEFAULT 'dine-in',
  ALTER COLUMN priority SET DEFAULT 'normal';

-- Keep constraints idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kots_order_type_check'
      AND conrelid = 'public.kots'::regclass
  ) THEN
    ALTER TABLE public.kots
      ADD CONSTRAINT kots_order_type_check
      CHECK (order_type IN ('dine-in', 'takeaway', 'delivery', 'aggregator'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kots_priority_check'
      AND conrelid = 'public.kots'::regclass
  ) THEN
    ALTER TABLE public.kots
      ADD CONSTRAINT kots_priority_check
      CHECK (priority IN ('normal', 'rush'));
  END IF;
END
$$;