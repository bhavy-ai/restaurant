-- Plan Change History
-- Tracks every plan change for a restaurant so billing can pro-rate charges
-- by the number of days on each plan within a billing month.

CREATE TABLE IF NOT EXISTS public.plan_change_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  old_plan        TEXT NOT NULL,
  new_plan        TEXT NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by      UUID REFERENCES public.platform_superadmins(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_change_history_restaurant_id
  ON public.plan_change_history(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_plan_change_history_changed_at
  ON public.plan_change_history(changed_at);

ALTER TABLE public.plan_change_history ENABLE ROW LEVEL SECURITY;

-- Superadmins can read/write all records
DROP POLICY IF EXISTS "superadmins_manage_plan_change_history" ON public.plan_change_history;
CREATE POLICY "superadmins_manage_plan_change_history"
  ON public.plan_change_history
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_superadmins
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_superadmins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
