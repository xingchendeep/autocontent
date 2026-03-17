/**
 * 微信公众号文章内容提取器
 * 目标选择器：#js_content
 */
export function extractWechat(): string {
  const el = document.querySelector<HTMLElement>('#js_content');
  if (!el) return '';
  return el.innerText.trim();
}
