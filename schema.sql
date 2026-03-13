-- AutoContent Pro
-- Database schema
-- Version: v0.1
-- Date: 2026-03-13
--
-- Target: Supabase Postgres
-- Notes:
-- 1. Run with a role that can create extensions, tables, indexes, and policies.
-- 2. Assumes auth.users is managed by Supabase Auth.

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- updated_at helper
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- profiles
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name varchar(100),
  avatar_url text,
  default_tone varchar(30),
  default_language varchar(20) not null default 'zh-CN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- ============================================================================
-- plans
-- ============================================================================

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null unique,
  display_name varchar(100) not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency varchar(10) not null default 'USD',
  monthly_generation_limit integer,
  platform_limit integer,
  speed_tier varchar(20) not null default 'standard',
  has_history boolean not null default true,
  has_api_access boolean not null default false,
  has_team_access boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_speed_tier_check check (speed_tier in ('standard', 'fast', 'priority', 'dedicated'))
);

create trigger trg_plans_updated_at
before update on public.plans
for each row
execute function public.set_updated_at();

insert into public.plans (
  code,
  display_name,
  price_cents,
  currency,
  monthly_generation_limit,
  platform_limit,
  speed_tier,
  has_history,
  has_api_access,
  has_team_access,
  metadata
)
values
  (
    'free',
    'Free',
    0,
    'USD',
    30,
    3,
    'standard',
    true,
    false,
    false,
    '{"features":["basic generation","local or limited cloud history"]}'::jsonb
  ),
  (
    'creator',
    'Creator',
    2900,
    'USD',
    null,
    10,
    'fast',
    true,
    false,
    false,
    '{"features":["all platforms","fast generation","cloud history"]}'::jsonb
  ),
  (
    'studio',
    'Studio',
    7900,
    'USD',
    null,
    10,
    'priority',
    true,
    false,
    true,
    '{"features":["priority queue","team-ready foundation"]}'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    19900,
    'USD',
    null,
    null,
    'dedicated',
    true,
    true,
    true,
    '{"features":["api access","dedicated support"]}'::jsonb
  )
on conflict (code) do update
set
  display_name = excluded.display_name,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  monthly_generation_limit = excluded.monthly_generation_limit,
  platform_limit = excluded.platform_limit,
  speed_tier = excluded.speed_tier,
  has_history = excluded.has_history,
  has_api_access = excluded.has_api_access,
  has_team_access = excluded.has_team_access,
  metadata = excluded.metadata,
  updated_at = now();

-- ============================================================================
-- subscriptions
-- ============================================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  provider varchar(30) not null default 'lemonsqueezy',
  provider_order_id varchar(255),
  provider_subscription_id varchar(255),
  status varchar(30) not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (
    status in ('active', 'cancelled', 'expired', 'past_due', 'trialing', 'paused')
  )
);

create unique index if not exists idx_subscriptions_provider_subscription_id
  on public.subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists idx_subscriptions_user_id
  on public.subscriptions(user_id);

create index if not exists idx_subscriptions_status
  on public.subscriptions(status);

create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

-- ============================================================================
-- generations
-- ============================================================================

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  input_source varchar(30) not null default 'manual',
  input_content text not null,
  extracted_url text,
  platforms text[] not null,
  platform_count integer not null check (platform_count >= 1),
  result_json jsonb not null,
  prompt_version varchar(50),
  model_name varchar(100),
  tokens_input integer not null default 0 check (tokens_input >= 0),
  tokens_output integer not null default 0 check (tokens_output >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  status varchar(30) not null default 'success',
  error_code varchar(100),
  error_message text,
  created_at timestamptz not null default now(),
  constraint generations_input_source_check check (input_source in ('manual', 'extract')),
  constraint generations_status_check check (status in ('success', 'failed', 'partial'))
);

create index if not exists idx_generations_user_id
  on public.generations(user_id);

create index if not exists idx_generations_created_at
  on public.generations(created_at desc);

create index if not exists idx_generations_status
  on public.generations(status);

-- ============================================================================
-- usage_stats
-- ============================================================================

create table if not exists public.usage_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_month char(7) not null,
  monthly_generation_count integer not null default 0 check (monthly_generation_count >= 0),
  total_generation_count integer not null default 0 check (total_generation_count >= 0),
  last_generation_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger trg_usage_stats_updated_at
before update on public.usage_stats
for each row
execute function public.set_updated_at();

-- ============================================================================
-- audit_logs
-- ============================================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action varchar(100) not null,
  resource_type varchar(100),
  resource_id varchar(100),
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_action
  on public.audit_logs(action);

create index if not exists idx_audit_logs_created_at
  on public.audit_logs(created_at desc);

create index if not exists idx_audit_logs_user_id
  on public.audit_logs(user_id);

-- ============================================================================
-- webhook events for idempotency
-- ============================================================================

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider varchar(30) not null,
  event_name varchar(100) not null,
  event_id varchar(255) not null,
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ============================================================================
-- helper views
-- ============================================================================

create or replace view public.current_active_subscriptions as
select distinct on (s.user_id)
  s.id,
  s.user_id,
  s.plan_id,
  p.code as plan_code,
  p.display_name as plan_display_name,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.updated_at
from public.subscriptions s
join public.plans p on p.id = s.plan_id
where s.status in ('active', 'trialing', 'past_due', 'paused')
order by s.user_id, s.updated_at desc;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.generations enable row level security;
alter table public.usage_stats enable row level security;
alter table public.audit_logs enable row level security;
alter table public.webhook_events enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
using (auth.uid() = id);

-- subscriptions
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
on public.subscriptions
for select
using (auth.uid() = user_id);

-- generations
drop policy if exists generations_select_own on public.generations;
create policy generations_select_own
on public.generations
for select
using (auth.uid() = user_id);

drop policy if exists generations_insert_own on public.generations;
create policy generations_insert_own
on public.generations
for insert
with check (auth.uid() = user_id);

-- usage_stats
drop policy if exists usage_stats_select_own on public.usage_stats;
create policy usage_stats_select_own
on public.usage_stats
for select
using (auth.uid() = user_id);

drop policy if exists usage_stats_update_own on public.usage_stats;
create policy usage_stats_update_own
on public.usage_stats
for update
using (auth.uid() = user_id);

-- audit_logs and webhook_events are service-role only by default.

commit;

