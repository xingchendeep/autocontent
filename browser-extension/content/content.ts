const MIN_CONTENT_LENGTH = 50;

/** 从多个选择器中取第一个有内容的元素文本 */
function textFrom(selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t && t.length > 2) return t;
  }
  return '';
}

/** 获取 meta 标签内容 */
function meta(name: string): string {
  const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
  return el?.getAttribute('content')?.trim() ?? '';
}

function getContent(): string {
  const url = window.location.href;
  const host = window.location.hostname;

  let title = '';
  let desc = '';

  if (host.includes('bilibili.com')) {
    title = textFrom(['h1.video-title', '.video-title', 'h1']) || document.title;
    desc = textFrom(['.basic-desc-info', '.desc-info-text', '#v_desc .info', '.video-desc .info']);
    if (!desc) desc = meta('description');
  } else if (host.includes('douyin.com')) {
    title = textFrom(['[data-e2e="video-desc"]', '.video-info-detail .title', 'h1']) || document.title;
    desc = meta('description');
  } else if (host.includes('xiaohongshu.com')) {
    title = textFrom(['#detail-title', '.note-title', 'h1[class*="title"]', 'h1']) || document.title;
    const noteDesc = textFrom([
      '#detail-desc .note-text', '#detail-desc',
      '.note-scroller .desc', '.note-desc', '.note-text',
    ]);
    const comments: string[] = [];
    document.querySelectorAll(
      '.comment-item .content, .comment-inner .content, ' +
      '[class*="commentContent"], [class*="comment-text"], ' +
      '.note-comment .content'
    ).forEach((el) => {
      const t = el.textContent?.trim();
      if (t && t.length > 1 && comments.length < 30) comments.push(t);
    });
    const parts: string[] = [];
    if (noteDesc) parts.push(noteDesc);
    if (comments.length > 0) parts.push('评论：\n' + comments.join('\n'));
    desc = parts.join('\n\n');
    if (!desc) desc = meta('description');
  } else if (host.includes('weibo.com') || host.includes('weibo.cn')) {
    title = document.title;
    desc = textFrom(['[class*="detail_wbtext"]', '.weibo-text', '.WB_text']);
    if (!desc) desc = meta('description');
  } else if (host.includes('mp.weixin.qq.com')) {
    title = textFrom(['#activity-name', 'h1']) || document.title;
    desc = textFrom(['#js_content']);
    if (desc.length > 2000) desc = desc.slice(0, 2000);
  } else if (host.includes('kuaishou.com')) {
    title = textFrom(['.video-info-title', '.title', 'h1']) || document.title;
    desc = textFrom(['.video-info-desc', '.desc']);
    if (!desc) desc = meta('description');
  } else if (host.includes('zhihu.com')) {
    title = textFrom(['.QuestionHeader-title', 'h1.Post-Title', 'h1']) || document.title;
    if (url.includes('/search')) {
      const items: string[] = [];
      document.querySelectorAll('.SearchResult-Card .content, .SearchResult-Card h2').forEach((el) => {
        const t = el.textContent?.trim();
        if (t && t.length > 5 && items.length < 10) items.push(t);
      });
      desc = items.join('\n\n');
      if (!desc) desc = meta('description');
    } else if (url.includes('/zvideo/') || url.includes('/video/')) {
      desc = meta('description');
    } else if (url.includes('/question/')) {
      const questionDesc = textFrom(['.QuestionRichText', '.QuestionHeader-detail']);
      const answer = textFrom(['.AnswerItem .RichContent-inner', '.AnswerItem .RichText', '.RichContent-inner']);
      const parts: string[] = [];
      if (questionDesc) parts.push(questionDesc);
      if (answer) parts.push(answer.slice(0, 2000));
      desc = parts.join('\n\n');
      if (!desc) desc = meta('description');
    } else {
      desc = textFrom(['.Post-RichTextContainer', '.RichText', '.RichContent-inner']);
      if (desc.length > 2000) desc = desc.slice(0, 2000);
    }
  } else if (host.includes('toutiao.com')) {
    title = textFrom(['.article-title', 'h1', '.title']) || document.title;
    desc = textFrom(['.article-content', '.article-detail']);
    if (!desc) desc = meta('description');
    if (desc.length > 2000) desc = desc.slice(0, 2000);
  } else if (host.includes('twitter.com') || host.includes('x.com')) {
    title = document.title;
    desc = meta('og:description') || meta('description');
  } else if (host.includes('linkedin.com')) {
    title = document.title;
    desc = meta('og:description') || meta('description');
  } else {
    title = document.title?.trim() ?? '';
    desc = meta('og:description') || meta('description');
    if (!desc) {
      desc = textFrom(['article', '[role="main"]', 'main', '.article-content']);
      if (desc.length > 2000) desc = desc.slice(0, 2000);
    }
  }

  title = (title || '')
    .replace(/^\s*\(\d+\s*封私信\)\s*/g, '')
    .replace(/^\s*\(\d+\s*条消息\)\s*/g, '')
    .replace(/\s*[-_|–—]\s*(哔哩哔哩|bilibili|抖音|小红书|微博|快手|知乎|今日头条|Toutiao|搜索结果).*$/i, '')
    .trim();

  // ── 全局 fallback：如果平台选择器没抓到足够内容，回退通用提取 ──
  if (!title) title = document.title?.trim() ?? '';
  if (!desc || desc.length < 10) {
    const fallbackDesc = meta('og:description') || meta('description');
    if (fallbackDesc && fallbackDesc.length > (desc?.length || 0)) {
      desc = fallbackDesc;
    }
  }
  if ((title.length + (desc?.length || 0)) < MIN_CONTENT_LENGTH) {
    const bodySelectors = [
      'article', '[role="main"]', 'main',
      '.article-content', '.post-content', '.content', '.entry-content',
    ];
    const bodyText = textFrom(bodySelectors);
    if (bodyText.length > (desc?.length || 0)) {
      desc = bodyText.slice(0, 2000);
    }
  }
  if ((title.length + (desc?.length || 0)) < MIN_CONTENT_LENGTH) {
    const bodyInner = document.body?.innerText?.trim() ?? '';
    if (bodyInner.length > 0) {
      desc = bodyInner.slice(0, 2000);
    }
  }

  const combined = [title, desc].filter(Boolean).join('\n\n');
  return combined.slice(0, 5000);
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
