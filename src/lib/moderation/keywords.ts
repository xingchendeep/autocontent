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
  '六四',
  // 暴力 / 违禁
  '制造炸弹',
  '购买枪支',
  // 色情
  '色情',
  '裸体视频',
  // 诈骗
  '洗钱',
  '非法集资',
];
