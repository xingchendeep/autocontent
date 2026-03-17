/**
 * 知乎文章内容提取器
 * 目标选择器：.Post-RichTextContainer 或 .RichText
 */
export function extractZhihu(): string {
  const el =
    document.querySelector<HTMLElement>('.Post-RichTextContainer') ??
    document.querySelector<HTMLElement>('.RichText');
  if (!el) return '';
  return el.innerText.trim();
}
