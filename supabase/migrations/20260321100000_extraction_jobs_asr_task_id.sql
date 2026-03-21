BEGIN;

-- 添加 asr_task_id 字段，用于存储 DashScope ASR 异步任务 ID
-- process 路由提交 ASR 任务后保存 task_id，GET 路由轮询时检查任务状态
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS asr_task_id TEXT;

COMMIT;
