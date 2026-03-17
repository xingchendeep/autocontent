import { logger } from '@/lib/logger';

/**
 * 视频代理下载器
 * 绕过防盗链限制：下载视频 → 上传到 DashScope 临时 OSS → 返回 oss:// URL 给 ASR
 *
 * 方案：使用 DashScope 自带的临时存储（48小时有效，免费）
 * 文档：https://www.alibabacloud.com/help/en/model-studio/get-temporary-file-url
 */

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/** 平台对应的 Referer */
const REFERER_MAP: Record<string, string> = {
  douyin: 'https://www.douyin.com/',
  kuaishou: 'https://www.kuaishou.com/',
  xiaohongshu: 'https://www.xiaohongshu.com/',
  weibo: 'https://weibo.com/',
  toutiao: 'https://www.toutiao.com/',
};

export interface ProxyResult {
  fileId: string;
  publicUrl: string;
  size: number;
  /** 是否使用了 oss:// 前缀（需要在 ASR 请求中加 header） */
  isOssPrefix: boolean;
}

/** DashScope 上传凭证响应 */
interface UploadPolicy {
  policy: string;
  signature: string;
  upload_dir: string;
  upload_host: string;
  expire_in_seconds: number;
  max_file_size_mb: string;
  oss_access_key_id: string;
  x_oss_object_acl: string;
  x_oss_forbid_overwrite: string;
}

function getDashScopeApiKey(): string {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('DASHSCOPE_API_KEY is not configured');
  return key;
}

/**
 * 获取 DashScope 临时 OSS 上传凭证
 */
async function getDashScopeUploadPolicy(): Promise<UploadPolicy> {
  const apiKey = getDashScopeApiKey();

  const res = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=paraformer-v2',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!res.ok) {
    const text = await res.text();
    logger.error('video-proxy: failed to get upload policy', { status: res.status, body: text });
    throw new Error(`获取上传凭证失败（${res.status}）`);
  }

  const json = (await res.json()) as { data: UploadPolicy };
  return json.data;
}

/**
 * 上传文件到 DashScope 临时 OSS
 * 返回 oss:// 前缀的 URL（48小时有效）
 */
async function uploadToDashScopeOss(
  buffer: Buffer,
  fileName: string,
  policy: UploadPolicy,
  mimeType = 'video/mp4',
): Promise<string> {
  const key = `${policy.upload_dir}/${fileName}`;

  // 构建 multipart/form-data
  const formData = new FormData();
  formData.append('OSSAccessKeyId', policy.oss_access_key_id);
  formData.append('Signature', policy.signature);
  formData.append('policy', policy.policy);
  formData.append('x-oss-object-acl', policy.x_oss_object_acl);
  formData.append('x-oss-forbid-overwrite', policy.x_oss_forbid_overwrite);
  formData.append('key', key);
  formData.append('success_action_status', '200');
  // file 必须是最后一个字段
  formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);

  const res = await fetch(policy.upload_host, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error('video-proxy: OSS upload failed', { status: res.status, body: text.slice(0, 500) });
    throw new Error(`文件上传到 DashScope OSS 失败（${res.status}）`);
  }

  const ossUrl = `oss://${key}`;
  logger.info('video-proxy: uploaded to DashScope OSS', { ossUrl: ossUrl.slice(0, 80) });
  return ossUrl;
}

/**
 * 代理下载视频并上传到 DashScope 临时 OSS
 */
export async function proxyDownloadVideo(
  videoUrl: string,
  platform: string,
): Promise<ProxyResult> {
  const fileId = crypto.randomUUID();
  const referer = REFERER_MAP[platform] ?? '';

  logger.info('video-proxy: downloading', { videoUrl: videoUrl.slice(0, 120), platform });

  const res = await fetch(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: referer,
      Origin: referer ? new URL(referer).origin : '',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`视频下载失败（${res.status}），可能是防盗链限制`);
  }

  const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_FILE_SIZE) {
    throw new Error(`视频文件过大（${Math.round(contentLength / 1024 / 1024)}MB），最大支持 500MB`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) {
    throw new Error('下载的视频文件过小，可能不是有效的视频');
  }

  // 诊断：检查文件头（magic bytes）判断文件类型
  const contentType = res.headers.get('content-type') ?? 'unknown';
  const hex = buffer.subarray(0, 12).toString('hex');
  const isMp4 = hex.includes('66747970'); // 'ftyp' in hex — MP4/M4A container signature
  const isWebm = hex.startsWith('1a45dfa3'); // WebM/MKV signature
  const isAac = hex.startsWith('fff1') || hex.startsWith('fff9'); // AAC ADTS
  const isMp3 = hex.startsWith('fff3') || hex.startsWith('fffb') || hex.startsWith('4944'); // MP3 or ID3

  // 判断是否为纯音频文件
  const isAudioFile = isAac || isMp3
    || contentType.startsWith('audio/')
    || /\.(mp3|m4a|aac|wav|flac|ogg)(\?|$)/i.test(videoUrl);

  logger.info('video-proxy: downloaded', {
    fileId,
    sizeMB: Math.round(buffer.length / 1024 / 1024),
    sizeBytes: buffer.length,
    contentType,
    magicHex: hex,
    isMp4,
    isWebm,
    isAudioFile,
    videoUrl: videoUrl.slice(0, 200),
  });

  // 根据文件类型选择扩展名和 MIME
  let ext = 'mp4';
  let mimeType = 'video/mp4';
  if (isAac) { ext = 'aac'; mimeType = 'audio/aac'; }
  else if (isMp3) { ext = 'mp3'; mimeType = 'audio/mpeg'; }
  else if (isAudioFile && isMp4) { ext = 'm4a'; mimeType = 'audio/mp4'; }
  else if (isWebm) { ext = 'webm'; mimeType = 'video/webm'; }

  // 上传到 DashScope 临时 OSS
  const fileName = `${fileId}.${ext}`;
  const policy = await getDashScopeUploadPolicy();
  const ossUrl = await uploadToDashScopeOss(buffer, fileName, policy, mimeType);

  return {
    fileId,
    publicUrl: ossUrl,
    size: buffer.length,
    isOssPrefix: true,
  };
}

/** 清理临时文件（DashScope OSS 文件 48 小时后自动删除，无需手动清理） */
export async function cleanupTempFile(_fileId: string): Promise<void> {
  // DashScope 临时 OSS 文件 48 小时后自动过期删除
  // 无需手动清理
}
