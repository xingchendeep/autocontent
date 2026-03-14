-- AutoContent Pro
-- Initial schema migration
-- Version: v0.1
-- Date: 2026-03-13
--
-- Target: Supabase Postgres 15
-- Notes:
--   All DDL uses IF NOT EXISTS / CREATE OR REPLACE for idempotency.
--   Seed inserts use ON CONFLICT … DO UPDATE.
--   Entire file is wrapped in a single transaction.

BEGIN;

-- ============================================================================
-- Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- updated_at helper trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    VARCHAR(100),
  avatar_url      TEXT,
  default_tone    VARCHAR(30),
  default_language VARCHAR(20) NOT NULL DEFAULT 'zh-CN',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- plans
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     VARCHAR(50)  NOT NULL UNIQUE,
  display_name             VARCHAR(100) NOT NULL,
  price_cents              INTEGER      NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency                 VARCHAR(10)  NOT NULL DEFAULT 'USD',
  monthly_generation_limit INTEGER,
  platform_limit           INTEGER,
  speed_tier               VARCHAR(20)  NOT NULL DEFAULT 'standard',
  has_history              BOOLEAN      NOT NULL DEFAULT TRUE,
  has_api_access           BOOLEAN      NOT NULL DEFAULT FALSE,
  has_team_access          BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active                BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT plans_speed_tier_check CHECK (speed_tier IN ('standard', 'fast', 'priority', 'dedicated'))
);

CREATE OR REPLACE TRIGGER trg_plans_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.plans (
  code, display_name, price_cents, currency,
  monthly_generation_limit, platform_limit, speed_tier,
  has_history, has_api_access, has_team_access, metadata
) VALUES
  (
    'free', 'Free', 0, 'USD', 30, 3, 'standard',
    TRUE, FALSE, FALSE,
    '{"features":["basic generation","local or limited cloud history"]}'::jsonb
  ),
  (
    'creator', 'Creator', 2900, 'USD', NULL, 10, 'fast',
    TRUE, FALSE, FALSE,
    '{"features":["all platforms","fast generation","cloud history"]}'::jsonb
  ),
  (
    'studio', 'Studio', 7900, 'USD', NULL, 10, 'priority',
    TRUE, FALSE, TRUE,
    '{"features":["priority queue","team-ready foundation"]}'::jsonb
  ),
  (
    'enterprise', 'Enterprise', 19900, 'USD', NULL, NULL, 'dedicated',
    TRUE, TRUE, TRUE,
    '{"features":["api access","dedicated support"]}'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  display_name             = EXCLUDED.display_name,
  price_cents              = EXCLUDED.price_cents,
  currency                 = EXCLUDED.currency,
  monthly_generation_limit = EXCLUDED.monthly_generation_limit,
  platform_limit           = EXCLUDED.platform_limit,
  speed_tier               = EXCLUDED.speed_tier,
  has_history              = EXCLUDED.has_history,
  has_api_access           = EXCLUDED.has_api_access,
  has_team_access          = EXCLUDED.has_team_access,
  metadata                 = EXCLUDED.metadata,
  updated_at               = now();

-- ============================================================================
-- subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                  UUID        NOT NULL REFERENCES public.plans(id),
  provider                 VARCHAR(30) NOT NULL DEFAULT 'lemonsqueezy',
  provider_order_id        VARCHAR(255),
  provider_subscription_id VARCHAR(255),
  status                   VARCHAR(30) NOT NULL,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  metadata                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('active', 'cancelled', 'expired', 'past_due', 'trialing', 'paused')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription_id
  ON public.subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON public.subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions(status);

CREATE OR REPLACE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- generations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.generations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  input_source   VARCHAR(30) NOT NULL DEFAULT 'manual',
  input_content  TEXT        NOT NULL,
  extracted_url  TEXT,
  platforms      TEXT[]      NOT NULL,
  platform_count INTEGER     NOT NULL CHECK (platform_count >= 1),
  result_json    JSONB       NOT NULL,
  prompt_version VARCHAR(50),
  model_name     VARCHAR(100),
  tokens_input   INTEGER     NOT NULL DEFAULT 0 CHECK (tokens_input >= 0),
  tokens_output  INTEGER     NOT NULL DEFAULT 0 CHECK (tokens_output >= 0),
  duration_ms    INTEGER     NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  status         VARCHAR(30) NOT NULL DEFAULT 'success',
  error_code     VARCHAR(100),
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT generations_input_source_check CHECK (input_source IN ('manual', 'extract')),
  CONSTRAINT generations_status_check       CHECK (status IN ('success', 'failed', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_generations_user_id
  ON public.generations(user_id);

CREATE INDEX IF NOT EXISTS idx_generations_created_at
  ON public.generations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generations_status
  ON public.generations(status);

-- ============================================================================
-- usage_stats
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.usage_stats (
  user_id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_month            CHAR(7)     NOT NULL,
  monthly_generation_count INTEGER     NOT NULL DEFAULT 0 CHECK (monthly_generation_count >= 0),
  total_generation_count   INTEGER     NOT NULL DEFAULT 0 CHECK (total_generation_count >= 0),
  last_generation_at       TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_usage_stats_updated_at
BEFORE UPDATE ON public.usage_stats
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- audit_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id   VARCHAR(100),
  ip_address    INET,
  user_agent    TEXT,
  metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs(user_id);

-- ============================================================================
-- webhook_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     VARCHAR(30)  NOT NULL,
  event_name   VARCHAR(100) NOT NULL,
  event_id     VARCHAR(255) NOT NULL,
  processed_at TIMESTAMPTZ,
  payload      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

-- ============================================================================
-- Views
-- ============================================================================

CREATE OR REPLACE VIEW public.current_active_subscriptions AS
SELECT DISTINCT ON (s.user_id)
  s.id,
  s.user_id,
  s.plan_id,
  p.code          AS plan_code,
  p.display_name  AS plan_display_name,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.updated_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.status IN ('active', 'trialing', 'past_due', 'paused')
ORDER BY s.user_id, s.updated_at DESC;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- subscriptions (read-only for authenticated users; writes via service role)
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- generations
DROP POLICY IF EXISTS generations_select_own ON public.generations;
CREATE POLICY generations_select_own ON public.generations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS generations_insert_own ON public.generations;
CREATE POLICY generations_insert_own ON public.generations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- usage_stats
DROP POLICY IF EXISTS usage_stats_select_own ON public.usage_stats;
CREATE POLICY usage_stats_select_own ON public.usage_stats
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS usage_stats_update_own ON public.usage_stats;
CREATE POLICY usage_stats_update_own ON public.usage_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- audit_logs and webhook_events: RLS enabled, no permissive policies
-- (service role only access)

COMMIT;
