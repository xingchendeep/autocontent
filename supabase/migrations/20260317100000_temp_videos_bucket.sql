-- 创建临时视频存储桶（用于 ASR 语音识别代理）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-videos',
  'temp-videos',
  true,
  524288000, -- 500MB
  ARRAY['video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- 允许公开读取（DashScope 需要下载）
CREATE POLICY "Public read temp videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'temp-videos');

-- 只允许 service_role 上传和删除
CREATE POLICY "Service role manage temp videos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'temp-videos')
  WITH CHECK (bucket_id = 'temp-videos');
