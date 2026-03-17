-- AutoContent Pro
-- Saved Scripts table
-- Allows users to save input scripts for later reuse
-- Date: 2026-03-17

BEGIN;

CREATE TABLE IF NOT EXISTS public.saved_scripts (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL CHECK (char_length(title) >= 1),
  content     TEXT         NOT NULL CHECK (char_length(content) >= 1),
  source      VARCHAR(30)  NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual', 'extract')),
  source_url  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_scripts_user_id
  ON public.saved_scripts(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_scripts_created_at
  ON public.saved_scripts(created_at DESC);

CREATE OR REPLACE TRIGGER trg_saved_scripts_updated_at
BEFORE UPDATE ON public.saved_scripts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.saved_scripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_scripts_select_own ON public.saved_scripts;
CREATE POLICY saved_scripts_select_own ON public.saved_scripts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS saved_scripts_insert_own ON public.saved_scripts;
CREATE POLICY saved_scripts_insert_own ON public.saved_scripts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS saved_scripts_update_own ON public.saved_scripts;
CREATE POLICY saved_scripts_update_own ON public.saved_scripts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS saved_scripts_delete_own ON public.saved_scripts;
CREATE POLICY saved_scripts_delete_own ON public.saved_scripts
  FOR DELETE USING (auth.uid() = user_id);

COMMIT;
