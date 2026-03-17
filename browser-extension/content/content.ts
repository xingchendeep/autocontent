import { extractWechat } from './extractors/wechat';
import { extractZhihu } from './extractors/zhihu';

const MIN_CONTENT_LENGTH = 50;

/** 通用提取：取页面标题 + 正文主体文本 */
function extractGeneric(): string {
  const title = document.title?.trim() ?? '';

  // 尝试常见正文容器
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.article-content',
    '.post-content',
    '.video-desc',           // B站视频简介
    '.desc-info-text',       // B站新版
    '#video-desc',
    '.content',
    '.entry-content',
  ];

  let body = '';
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent && el.textContent.trim().length > 30) {
      body = el.textContent.trim();
      break;
    }
  }

  // fallback: 取 body 内所有可见文本
  if (!body) {
    body = document.body?.innerText?.trim() ?? '';
  }

  // 截取前 5000 字符避免过长
  const combined = title ? `${title}\n\n${body}` : body;
  return combined.slice(0, 5000);
}

function getContent(): string {
  const url = window.location.href;
  if (url.includes('mp.weixin.qq.com')) {
    return extractWechat();
  }
  if (url.includes('zhihu.com')) {
    return extractZhihu();
  }
  // 通用提取 fallback
  return extractGeneric();
}

const content = getContent();

chrome.runtime.sendMessage({
  type: 'CONTENT_EXTRACTED',
  payload: {
    content,
    valid: content.length >= MIN_CONTENT_LENGTH,
    url: window.location.href,
  },
});
