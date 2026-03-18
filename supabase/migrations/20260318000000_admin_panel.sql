-- AutoContent Pro
-- Admin Panel schema migration
-- Version: admin-panel
-- Date: 2026-03-18
--
-- Changes:
--   1. ALTER profiles: add role, is_disabled columns
--   2. CREATE site_settings table + seed data
--   3. CREATE system_templates table + seed data (10 platforms)
--   4. CREATE blocked_keywords table + seed data
--   5. RLS policies for new tables

BEGIN;

-- ============================================================================
-- 1. profiles 表变更：添加 role 和 is_disabled 字段
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Add CHECK constraint separately (IF NOT EXISTS not supported for constraints)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('user', 'admin', 'super_admin'));
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 2. site_settings 表
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT         NOT NULL,
  value_type  VARCHAR(20)  NOT NULL DEFAULT 'string'
              CHECK (value_type IN ('string', 'integer', 'boolean', 'json')),
  updated_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed site settings
INSERT INTO public.site_settings (key, value, value_type) VALUES
  ('site_title', 'AutoContent Pro', 'string'),
  ('site_description', '粘贴视频脚本，一键生成 10 大平台专属文案', 'string'),
  ('hero_title', 'AutoContent Pro', 'string'),
  ('hero_description', '粘贴视频音频链接（B站/抖音/快手等）、上传本地音视频文件、粘贴文本，自动提取全部语音、文字内容，一键生成10大平台专属文案，三十秒搞定。', 'string'),
  ('copyright_text', '© 2026 AutoContent Pro', 'string'),
  ('meta_keywords', 'AI文案,多平台文案,内容创作,视频文案,自动生成', 'string'),
  ('system:rate_limit_per_minute', '20', 'integer'),
  ('system:max_input_length', '100000', 'integer'),
  ('system:max_platforms_per_request', '10', 'integer')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 3. system_templates 表
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_templates (
  platform           VARCHAR(30)  PRIMARY KEY,
  display_name       VARCHAR(100) NOT NULL,
  prompt_instructions TEXT        NOT NULL,
  max_title_length   INTEGER      NOT NULL CHECK (max_title_length >= 0),
  max_content_length INTEGER      NOT NULL CHECK (max_content_length >= 0),
  hashtag_style      VARCHAR(20)  NOT NULL
                     CHECK (hashtag_style IN ('inline', 'trailing', 'none')),
  prompt_version     VARCHAR(50)  NOT NULL DEFAULT 'v1',
  updated_by         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed system templates from PLATFORM_TEMPLATES constant
INSERT INTO public.system_templates (platform, display_name, prompt_instructions, max_title_length, max_content_length, hashtag_style, prompt_version) VALUES
  ('douyin', '抖音',
   '为抖音短视频生成文案。标题要吸引眼球、有悬念感，正文简短有力（150字以内），结尾加互动引导语。使用流行话题标签，风格活泼年轻。',
   30, 150, 'trailing', 'v1'),
  ('xiaohongshu', '小红书',
   '为小红书生成图文笔记文案。标题加emoji，正文分段清晰（300字以内），语气亲切真实，像朋友分享。标签用#话题#格式穿插在正文中。',
   20, 300, 'inline', 'v1'),
  ('bilibili', 'B站',
   '为B站视频生成简介文案。标题专业且有信息量，正文介绍视频核心内容（200字以内），可加时间轴提示，语气偏向知识分享型。',
   80, 200, 'trailing', 'v1'),
  ('weibo', '微博',
   '为微博生成帖子文案。内容简洁有观点（140字以内），可加话题标签#话题#，语气轻松，适合引发讨论和转发。',
   0, 140, 'inline', 'v1'),
  ('wechat', '微信公众号',
   '为微信公众号生成推文文案。标题有吸引力，正文结构清晰（500字以内），语气专业但不失温度，适合深度阅读，结尾引导关注或分享。',
   64, 500, 'none', 'v1'),
  ('twitter', 'Twitter / X',
   'Generate a Twitter/X post. Keep it under 280 characters, punchy and direct. Use 1-2 relevant hashtags at the end. English preferred unless content is Chinese.',
   0, 280, 'trailing', 'v1'),
  ('linkedin', 'LinkedIn',
   'Generate a LinkedIn post. Professional tone, insightful and value-driven (300 words max). Start with a hook, use short paragraphs, end with a question or call to action. 3-5 hashtags at the end.',
   0, 700, 'trailing', 'v1'),
  ('kuaishou', '快手',
   '为快手短视频生成文案。标题接地气、有共鸣感，正文简短直白（100字以内），语气朴实亲切，贴近下沉市场用户，结尾加互动引导。',
   30, 100, 'trailing', 'v1'),
  ('zhihu', '知乎',
   '为知乎生成回答或文章文案。标题是问题或观点式，正文逻辑严谨、有数据或案例支撑（400字以内），语气理性专业，适合知识型读者。',
   50, 400, 'none', 'v1'),
  ('toutiao', '今日头条',
   '为今日头条生成资讯文章文案。标题有新闻感、数字或悬念，正文信息密度高（300字以内），语气客观中立，适合大众阅读。',
   30, 300, 'none', 'v1')
ON CONFLICT (platform) DO NOTHING;

-- ============================================================================
-- 4. blocked_keywords 表
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blocked_keywords (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword    VARCHAR(100) NOT NULL UNIQUE,
  category   VARCHAR(50)  NOT NULL DEFAULT 'general',
  created_by UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocked_keywords_category
  ON public.blocked_keywords(category);

-- Seed blocked keywords from BLOCKED_KEYWORDS constant
INSERT INTO public.blocked_keywords (keyword, category) VALUES
  ('法轮功', '政治敏感'),
  ('天安门事件', '政治敏感'),
  ('六四事件', '政治敏感'),
  ('制造炸弹', '暴力违禁'),
  ('购买枪支', '暴力违禁'),
  ('裸体视频', '色情'),
  ('色情网站', '色情'),
  ('色情视频', '色情'),
  ('洗钱教程', '诈骗'),
  ('非法集资', '诈骗')
ON CONFLICT (keyword) DO NOTHING;

-- ============================================================================
-- 5. RLS 策略
-- ============================================================================

-- site_settings: service role only (no permissive policies)
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- system_templates: all authenticated users can read, writes via service role
ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_templates_select_all ON public.system_templates;
CREATE POLICY system_templates_select_all ON public.system_templates
  FOR SELECT USING (true);

-- blocked_keywords: service role only (no permissive policies)
ALTER TABLE public.blocked_keywords ENABLE ROW LEVEL SECURITY;

COMMIT;
