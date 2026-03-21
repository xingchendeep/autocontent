BEGIN;

-- 允许已登录用户上传文件到自己的目录（{user_id}/...）
-- 前端直传 Supabase Storage 绕过 Vercel 4.5MB 请求体限制
DROP POLICY IF EXISTS "Authenticated users upload own temp videos" ON storage.objects;
CREATE POLICY "Authenticated users upload own temp videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'temp-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 允许已登录用户删除自己的文件（清理用）
DROP POLICY IF EXISTS "Authenticated users delete own temp videos" ON storage.objects;
CREATE POLICY "Authenticated users delete own temp videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'temp-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 更新 allowed_mime_types，补充 MOV 和 OGG
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'
]
WHERE id = 'temp-videos';

COMMIT;
