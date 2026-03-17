-- AutoContent Pro v2.0
-- v2 Product Differentiation Schema Migration
-- Version: v2.0
-- Date: 2026-03-16
--
-- New tables: user_templates, batch_jobs, batch_job_items,
--             teams, team_members, team_invitations, api_keys
-- Depends on: 20260313000000_initial_schema.sql

BEGIN;

-- ============================================================================
-- Add has_batch_access to plans (v2 feature gate)
-- ============================================================================

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS has_batch_access BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- user_templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_templates (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                VARCHAR(100) NOT NULL CHECK (char_length(name) >= 1),
  tone                VARCHAR(30)  NOT NULL
                      CHECK (tone IN ('professional','casual','humorous','authoritative','empathetic')),
  length              VARCHAR(20)  NOT NULL DEFAULT 'medium'
                      CHECK (length IN ('short','medium','long')),
  custom_instructions TEXT         CHECK (char_length(custom_instructions) <= 2000),
  platform_overrides  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_templates_user_id
  ON public.user_templates(user_id);

CREATE INDEX IF NOT EXISTS idx_user_templates_updated_at
  ON public.user_templates(updated_at DESC);

CREATE OR REPLACE TRIGGER trg_user_templates_updated_at
BEFORE UPDATE ON public.user_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- batch_jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.batch_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','completed','failed','partial')),
  item_count      INTEGER     NOT NULL CHECK (item_count BETWEEN 1 AND 50),
  completed_count INTEGER     NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  failed_count    INTEGER     NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  template_id     UUID        REFERENCES public.user_templates(id) ON DELETE SET NULL,
  platforms       TEXT[]      NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT batch_jobs_counts_check CHECK (completed_count + failed_count <= item_count)
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id
  ON public.batch_jobs(user_id);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_status
  ON public.batch_jobs(status);

CREATE OR REPLACE TRIGGER trg_batch_jobs_updated_at
BEFORE UPDATE ON public.batch_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- batch_job_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.batch_job_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID        NOT NULL REFERENCES public.batch_jobs(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','completed','failed')),
  input_content TEXT        NOT NULL,
  results       JSONB,
  error_message TEXT,
  retry_count   INTEGER     NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 3),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_job_items_job_id
  ON public.batch_job_items(job_id);

CREATE INDEX IF NOT EXISTS idx_batch_job_items_status
  ON public.batch_job_items(status);

CREATE OR REPLACE TRIGGER trg_batch_job_items_updated_at
BEFORE UPDATE ON public.batch_job_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- teams
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.teams (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL CHECK (char_length(name) >= 1),
  owner_id   UUID         NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan_id    UUID         REFERENCES public.plans(id),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_owner_id
  ON public.teams(owner_id);

CREATE OR REPLACE TRIGGER trg_teams_updated_at
BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- team_members
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.team_members (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      VARCHAR(20) NOT NULL CHECK (role IN ('owner','admin','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id
  ON public.team_members(team_id);

CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON public.team_members(user_id);

-- ============================================================================
-- team_invitations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID         NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invited_email VARCHAR(255) NOT NULL,
  invited_by    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token         VARCHAR(64)  NOT NULL UNIQUE,
  role          VARCHAR(20)  NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  expires_at    TIMESTAMPTZ  NOT NULL,
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_token
  ON public.team_invitations(token);

CREATE INDEX IF NOT EXISTS idx_team_invitations_team_id
  ON public.team_invitations(team_id);

-- ============================================================================
-- api_keys
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  key_hash     VARCHAR(64)  NOT NULL UNIQUE,
  key_prefix   VARCHAR(12)  NOT NULL,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
  ON public.api_keys(user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
  ON public.api_keys(key_hash);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE public.user_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_job_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys         ENABLE ROW LEVEL SECURITY;

-- user_templates: users can only access their own templates
DROP POLICY IF EXISTS user_templates_select_own ON public.user_templates;
CREATE POLICY user_templates_select_own ON public.user_templates
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_templates_insert_own ON public.user_templates;
CREATE POLICY user_templates_insert_own ON public.user_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_templates_update_own ON public.user_templates;
CREATE POLICY user_templates_update_own ON public.user_templates
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_templates_delete_own ON public.user_templates;
CREATE POLICY user_templates_delete_own ON public.user_templates
  FOR DELETE USING (auth.uid() = user_id);

-- batch_jobs: users can only access their own jobs
DROP POLICY IF EXISTS batch_jobs_select_own ON public.batch_jobs;
CREATE POLICY batch_jobs_select_own ON public.batch_jobs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS batch_jobs_insert_own ON public.batch_jobs;
CREATE POLICY batch_jobs_insert_own ON public.batch_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- batch_job_items: users can only read their own items (writes via service role)
DROP POLICY IF EXISTS batch_job_items_select_own ON public.batch_job_items;
CREATE POLICY batch_job_items_select_own ON public.batch_job_items
  FOR SELECT USING (auth.uid() = user_id);

-- teams: users can see teams they belong to
DROP POLICY IF EXISTS teams_select_member ON public.teams;
CREATE POLICY teams_select_member ON public.teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS teams_insert_own ON public.teams;
CREATE POLICY teams_insert_own ON public.teams
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- team_members: users can see members of teams they belong to
DROP POLICY IF EXISTS team_members_select_own_team ON public.team_members;
CREATE POLICY team_members_select_own_team ON public.team_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_id AND tm.user_id = auth.uid()
    )
  );

-- team_invitations: only owner/admin can see invitations (via service role in app layer)
-- RLS enabled, no permissive policies — managed via service role

-- api_keys: users can only access their own keys
DROP POLICY IF EXISTS api_keys_select_own ON public.api_keys;
CREATE POLICY api_keys_select_own ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS api_keys_insert_own ON public.api_keys;
CREATE POLICY api_keys_insert_own ON public.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS api_keys_update_own ON public.api_keys;
CREATE POLICY api_keys_update_own ON public.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

COMMIT;
