/**
 * Blocked keyword list for content moderation.
 * Keep this file server-side only — never import in client components.
 *
 * Add or remove keywords here; the moderation service picks them up automatically.
 */
export const BLOCKED_KEYWORDS: readonly string[] = [
  // 政治敏感
  '法轮功',
  '天安门事件',
  '六四事件',
  // 暴力 / 违禁
  '制造炸弹',
  '购买枪支',
  // 色情（使用更精确的短语，避免误伤正常讨论）
  '裸体视频',
  '色情网站',
  '色情视频',
  // 诈骗
  '洗钱教程',
  '非法集资',
];
