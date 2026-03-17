BEGIN;

-- 视频脚本提取任务表
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  video_url TEXT NOT NULL,
  audio_url TEXT,
  platform TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  method TEXT CHECK (method IN ('subtitle_api', 'asr')),
  result_text TEXT,
  duration_seconds INTEGER,
  language TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_user_id ON extraction_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON extraction_jobs(status);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_extraction_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_extraction_jobs_updated_at ON extraction_jobs;
CREATE TRIGGER trg_extraction_jobs_updated_at
  BEFORE UPDATE ON extraction_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_extraction_jobs_updated_at();

-- RLS
ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extraction_jobs_select_own ON extraction_jobs;
CREATE POLICY extraction_jobs_select_own ON extraction_jobs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS extraction_jobs_insert_own ON extraction_jobs;
CREATE POLICY extraction_jobs_insert_own ON extraction_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role 可以更新所有记录（用于后台任务处理）
DROP POLICY IF EXISTS extraction_jobs_update_service ON extraction_jobs;
CREATE POLICY extraction_jobs_update_service ON extraction_jobs
  FOR UPDATE USING (true);

COMMIT;
