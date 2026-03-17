import { generate, extractVideoScript, waitForExtraction, type PlatformCode } from '../utils/api';
import { getApiKey, setApiKey, clearApiKey } from '../utils/storage';

const PLATFORM_NAMES: Record<PlatformCode, string> = {
  douyin: '抖音', xiaohongshu: '小红书', bilibili: '哔哩哔哩',
  weibo: '微博', wechat: '微信公众号', twitter: 'Twitter/X',
  linkedin: 'LinkedIn', kuaishou: '快手', zhihu: '知乎', toutiao: '今日头条',
};

let extractedContent = '';
let contentValid = false;

// ── DOM refs ──
const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const btnSaveKey = document.getElementById('btn-save-key') as HTMLButtonElement;
const btnClearKey = document.getElementById('btn-clear-key') as HTMLButtonElement;
const sectionSettings = document.getElementById('section-settings') as HTMLElement;
const sectionResults = document.getElementById('section-results') as HTMLElement;
const contentPreview = document.getElementById('content-preview') as HTMLElement;
const contentActions = document.getElementById('content-actions') as HTMLElement;
const btnToggleContent = document.getElementById('btn-toggle-content') as HTMLButtonElement;
const btnCopyContent = document.getElementById('btn-copy-content') as HTMLButtonElement;
const errorMsg = document.getElementById('error-msg') as HTMLElement;
const resultsList = document.getElementById('results-list') as HTMLElement;
const inputApiKey = document.getElementById('input-apikey') as HTMLInputElement;
const btnExtractScript = document.getElementById('btn-extract-script') as HTMLButtonElement;
const extractStatus = document.getElementById('extract-status') as HTMLElement;

let currentTabUrl = '';
let currentTabId: number | undefined;

// ── Settings toggle ──
btnSettings.addEventListener('click', () => {
  sectionSettings.classList.toggle('hidden');
});

btnSaveKey.addEventListener('click', async () => {
  const key = inputApiKey.value.trim();
  if (key) {
    await setApiKey(key);
    inputApiKey.value = '';
    sectionSettings.classList.add('hidden');
  }
});

btnClearKey.addEventListener('click', async () => {
  await clearApiKey();
  inputApiKey.value = '';
});

// ── Load saved key into input ──
getApiKey().then((key) => {
  if (key) inputApiKey.value = key;
});

let contentExpanded = false;

btnToggleContent.addEventListener('click', () => {
  contentExpanded = !contentExpanded;
  if (contentExpanded) {
    contentPreview.textContent = extractedContent;
    contentPreview.classList.add('expanded');
    btnToggleContent.textContent = '收起';
  } else {
    contentPreview.textContent = extractedContent.slice(0, 120) + (extractedContent.length > 120 ? '...' : '');
    contentPreview.classList.remove('expanded');
    btnToggleContent.textContent = '展开全文';
  }
});

btnCopyContent.addEventListener('click', async () => {
  await navigator.clipboard.writeText(extractedContent);
  btnCopyContent.textContent = '已复制';
  setTimeout(() => { btnCopyContent.textContent = '复制内容'; }, 1500);
});

// ── 提取视频脚本 ──
btnExtractScript.addEventListener('click', async () => {
  if (!currentTabUrl) {
    showExtractStatus('无法获取当前页面 URL', 'error');
    return;
  }

  btnExtractScript.disabled = true;
  btnExtractScript.textContent = '⏳ 提取中...';

  try {
    // B站：在客户端直接提取字幕（利用用户登录态）
    if (currentTabUrl.includes('bilibili.com') && currentTabId) {
      showExtractStatus('正在从 B站提取字幕...', 'loading');

      const [{ result: subResult }] = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: async () => {
          try {
            // 从 URL 提取 bvid
            const bvMatch = window.location.href.match(/\/video\/(BV[\w]+)/i);
            const bvid = bvMatch ? bvMatch[1] : null;
            if (!bvid) return { ok: false, error: '无法识别 B站视频 ID' };

            // 获取 cid
            const viewRes = await fetch(
              `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
              { credentials: 'include' },
            );
            const viewJson = await viewRes.json();
            const cid = viewJson?.data?.cid;
            if (!cid) return { ok: false, error: '无法获取视频信息' };

            // 获取字幕列表
            const playerRes = await fetch(
              `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
              { credentials: 'include' },
            );
            const playerJson = await playerRes.json();
            const subtitles = playerJson?.data?.subtitle?.subtitles;
            if (!subtitles || subtitles.length === 0) {
              return { ok: false, error: '该视频没有字幕' };
            }

            // 优先中文字幕
            const zhSub = subtitles.find((s: { lan: string }) => s.lan.startsWith('zh')) ?? subtitles[0];
            let subUrl = zhSub.subtitle_url;
            if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;

            const subRes = await fetch(subUrl);
            const subJson = await subRes.json();
            if (!subJson?.body?.length) return { ok: false, error: '字幕内容为空' };

            const items = subJson.body as Array<{ from: number; to: number; content: string }>;
            // 根据字幕时间间隔智能加标点
            // 间隔 < 0.5s → 同一句话内，用逗号
            // 间隔 >= 0.5s → 句子结束，用句号
            const parts: string[] = [];
            for (let i = 0; i < items.length; i++) {
              const s = items[i].content.trim();
              if (!s) continue;
              // 已有标点的直接保留
              if (/[。！？.!?]$/.test(s)) {
                parts.push(s);
                continue;
              }
              if (/[，,；;：:、…—]$/.test(s)) {
                parts.push(s);
                continue;
              }
              // 最后一条用句号
              if (i === items.length - 1) {
                parts.push(s + '。');
                continue;
              }
              // 根据与下一条的时间间隔判断
              const gap = items[i + 1].from - items[i].to;
              if (gap >= 0.5) {
                parts.push(s + '。');
              } else {
                parts.push(s + '，');
              }
            }
            const text = parts.join('');
            return { ok: true, text, lang: zhSub.lan };
          } catch (e) {
            return { ok: false, error: String(e) };
          }
        },
      });

      const sub = subResult as { ok: boolean; text?: string; lang?: string; error?: string } | undefined;
      if (sub?.ok && sub.text) {
        extractedContent = sub.text;
        contentValid = true;
        contentPreview.textContent = extractedContent.slice(0, 120) + (extractedContent.length > 120 ? '...' : '');
        contentPreview.classList.remove('invalid');
        btnGenerate.disabled = false;
        contentExpanded = false;
        btnToggleContent.textContent = '展开全文';
        showExtractStatus(`✅ B站字幕提取成功（${sub.lang ?? 'zh'}），可以生成文案了`, 'success');
      } else {
        showExtractStatus(`❌ ${sub?.error ?? '字幕提取失败，该视频可能没有字幕'}`, 'error');
      }
    } else if (currentTabUrl.includes('douyin.com') && currentTabId) {
      // 抖音：客户端提取视频 URL + awemeId → 服务端 ASR
      showExtractStatus('正在从抖音提取视频地址...', 'loading');

      const [{ result: dyResult }] = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: () => {
          try {
            const urls: string[] = [];
            const cleanUrl = (u: string) => u.replace(/\\u002F/g, '/').replace(/\\/g, '');
            const addUrl = (u: string) => {
              const clean = cleanUrl(u);
              if (clean.startsWith('http') && !urls.includes(clean)) urls.push(clean);
            };

            // 提取 awemeId（视频 ID）
            let awemeId = '';
            const url = window.location.href;
            // /video/123456 或 modal_id=123456
            const videoMatch = url.match(/\/video\/(\d+)/);
            const modalMatch = url.match(/modal_id=(\d+)/);
            awemeId = videoMatch?.[1] ?? modalMatch?.[1] ?? '';

            // 从 RENDER_DATA 提取视频 URL
            const renderScript = document.querySelector('#RENDER_DATA');
            if (renderScript?.textContent) {
              try {
                const decoded = decodeURIComponent(renderScript.textContent);
                const data = JSON.parse(decoded);

                // 也从 RENDER_DATA 中提取 awemeId
                if (!awemeId) {
                  const visited = new WeakSet();
                  const findId = (obj: unknown, depth: number): void => {
                    if (awemeId || depth > 10 || !obj || typeof obj !== 'object') return;
                    const o = obj as Record<string, unknown>;
                    if (visited.has(o)) return;
                    visited.add(o);
                    if (typeof o.aweme_id === 'string' && /^\d+$/.test(o.aweme_id)) {
                      awemeId = o.aweme_id;
                      return;
                    }
                    for (const v of Object.values(o)) {
                      if (v && typeof v === 'object') {
                        if (Array.isArray(v)) {
                          for (const item of v) findId(item, depth + 1);
                        } else {
                          findId(v, depth + 1);
                        }
                      }
                    }
                  };
                  findId(data, 0);
                }

                // 提取所有视频 URL
                const visited2 = new WeakSet();
                const traverse = (obj: unknown, depth: number): void => {
                  if (depth > 20 || !obj || typeof obj !== 'object') return;
                  const o = obj as Record<string, unknown>;
                  if (visited2.has(o)) return;
                  visited2.add(o);
                  if (Array.isArray(o.url_list)) {
                    for (const u of o.url_list) {
                      if (typeof u === 'string') addUrl(u);
                    }
                  }
                  for (const v of Object.values(o)) {
                    if (v && typeof v === 'object') {
                      if (Array.isArray(v)) {
                        for (const item of v) {
                          if (item && typeof item === 'object') traverse(item, depth + 1);
                        }
                      } else {
                        traverse(v, depth + 1);
                      }
                    }
                  }
                };
                traverse(data, 0);

                // 正则兜底
                if (urls.length === 0) {
                  const pat = /https?:\/\/[^"'\s]+?(?:douyinvod|v\d+-|ixigua|bytevcloudcdn|bytecdn|snssdk|amemv)[^"'\s]*/gi;
                  const matches = decoded.match(pat);
                  if (matches) for (const m of matches) addUrl(m);
                }
              } catch { /* parse failed */ }
            }

            // 从 video 标签提取
            for (const el of Array.from(document.querySelectorAll('video, xg-video'))) {
              const src = el.getAttribute('src') || (el as HTMLVideoElement).currentSrc;
              if (src) addUrl(src);
            }

            const best = urls.find(u => /\.mp4|mp4/i.test(u)) ?? urls[0];
            if (!best && !awemeId) {
              return { ok: false, error: '无法从抖音页面提取视频地址，请确保已打开视频播放页' };
            }

            return {
              ok: true,
              videoUrl: best ?? '',
              awemeId,
              debug: `urls=${urls.length}, awemeId=${awemeId || 'none'}`,
            };
          } catch (e) {
            return { ok: false, error: String(e) };
          }
        },
      });

      const dy = dyResult as { ok: boolean; videoUrl?: string; awemeId?: string; error?: string; debug?: string } | undefined;

      if (dy?.ok && (dy.videoUrl || dy.awemeId)) {
        showExtractStatus(`已获取视频信息（${dy.debug ?? ''}），正在提交语音识别任务...`, 'loading');
        try {
          const job = await extractVideoScript(currentTabUrl, dy.videoUrl, dy.awemeId);
          showExtractStatus(`语音识别任务已提交（${job.platform}），正在处理...`, 'loading');

          const result = await waitForExtraction(job.jobId);

          if (result.status === 'completed' && result.result?.text) {
            extractedContent = result.result.text;
            contentValid = true;
            contentPreview.textContent = extractedContent.slice(0, 120) + (extractedContent.length > 120 ? '...' : '');
            contentPreview.classList.remove('invalid');
            btnGenerate.disabled = false;
            contentExpanded = false;
            btnToggleContent.textContent = '展开全文';
            showExtractStatus('✅ 抖音视频语音识别完成，可以生成文案了', 'success');
          } else {
            showExtractStatus(`❌ 语音识别失败：${result.error ?? '未知错误'}`, 'error');
          }
        } catch (err) {
          showExtractStatus(`❌ ${(err as Error).message}`, 'error');
        }
      } else {
        showExtractStatus(`❌ ${dy?.error ?? '抖音视频地址提取失败'}`, 'error');
      }
    } else {
      // 非 B站：走服务端提取
      showExtractStatus('正在提交视频脚本提取任务...', 'loading');
      const job = await extractVideoScript(currentTabUrl);
      showExtractStatus(`任务已提交，正在提取（${job.platform}）...`, 'loading');

      const result = await waitForExtraction(job.jobId);

      if (result.status === 'completed' && result.result?.text) {
        extractedContent = result.result.text;
        contentValid = true;
        contentPreview.textContent = extractedContent.slice(0, 120) + (extractedContent.length > 120 ? '...' : '');
        contentPreview.classList.remove('invalid');
        btnGenerate.disabled = false;
        contentExpanded = false;
        btnToggleContent.textContent = '展开全文';
        const method = result.result.method === 'subtitle_api' ? '字幕' : '语音识别';
        showExtractStatus(`✅ 提取成功（${method}），可以生成文案了`, 'success');
      } else {
        showExtractStatus(`❌ 提取失败：${result.error ?? '未知错误'}`, 'error');
      }
    }
  } catch (err) {
    showExtractStatus(`❌ ${(err as Error).message}`, 'error');
  } finally {
    btnExtractScript.disabled = false;
    btnExtractScript.textContent = '🎬 提取视频脚本';
  }
});

function showExtractStatus(msg: string, type: 'loading' | 'success' | 'error'): void {
  extractStatus.textContent = msg;
  extractStatus.className = `extract-status ${type}`;
  extractStatus.classList.remove('hidden');
}

// ── Actively inject and extract page content when popup opens ──
async function extractPageContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      contentPreview.textContent = '无法获取当前标签页';
      contentPreview.classList.add('invalid');
      return;
    }

    // 保存当前标签页 URL 供视频脚本提取使用
    currentTabUrl = tab.url ?? '';
    currentTabId = tab.id;

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const MIN_LEN = 50;
        const url = window.location.href;
        const host = window.location.hostname;

        /** 辅助：从多个选择器中取第一个有内容的元素文本 */
        function textFrom(selectors: string[]): string {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            const t = el?.textContent?.trim();
            if (t && t.length > 2) return t;
          }
          return '';
        }

        /** 辅助：获取 meta 标签内容 */
        function meta(name: string): string {
          const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return el?.getAttribute('content')?.trim() ?? '';
        }

        let title = '';
        let desc = '';

        // ── B站 ──
        if (host.includes('bilibili.com')) {
          title = textFrom(['h1.video-title', '.video-title', 'h1']) || document.title;
          desc = textFrom([
            '.basic-desc-info', '.desc-info-text', '#v_desc .info',
            '.video-desc .info', '[class*="desc"]',
          ]);
          if (!desc) desc = meta('description');
        }
        // ── 抖音 ──
        else if (host.includes('douyin.com')) {
          title = textFrom([
            '[data-e2e="video-desc"]', '.video-info-detail .title',
            'h1', '.title-container',
          ]) || document.title;
          desc = meta('description');
        }
        // ── 小红书 ──
        else if (host.includes('xiaohongshu.com')) {
          // 标题
          title = textFrom([
            '#detail-title', '.note-title', 'h1[class*="title"]', 'h1',
          ]) || document.title;

          // 正文描述
          const noteDesc = textFrom([
            '#detail-desc .note-text', '#detail-desc',
            '.note-scroller .desc', '.note-desc', '.note-text',
          ]);

          // 评论区
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
        }
        // ── 微博 ──
        else if (host.includes('weibo.com') || host.includes('weibo.cn')) {
          title = document.title;
          desc = textFrom([
            '[class*="detail_wbtext"]', '.weibo-text', '.WB_text',
            '[class*="Feed_body"]', '.card-feed .content p',
          ]);
          if (!desc) desc = meta('description');
        }
        // ── 微信公众号 ──
        else if (host.includes('mp.weixin.qq.com')) {
          title = textFrom(['#activity-name', 'h1']) || document.title;
          desc = textFrom(['#js_content']);
          // 公众号文章取前 2000 字即可
          if (desc.length > 2000) desc = desc.slice(0, 2000);
        }
        // ── 快手 ──
        else if (host.includes('kuaishou.com')) {
          title = textFrom([
            '.video-info-title', '.title', 'h1',
          ]) || document.title;
          desc = textFrom([
            '.video-info-desc', '.desc', '[class*="caption"]',
          ]);
          if (!desc) desc = meta('description');
        }
        // ── 知乎 ──
        else if (host.includes('zhihu.com')) {
          title = textFrom([
            '.QuestionHeader-title', 'h1.Post-Title', 'h1',
          ]) || document.title;
          // 知乎搜索结果页
          if (url.includes('/search')) {
            const items: string[] = [];
            document.querySelectorAll('.SearchResult-Card .content, .SearchResult-Card h2').forEach((el) => {
              const t = el.textContent?.trim();
              if (t && t.length > 5 && items.length < 10) items.push(t);
            });
            desc = items.join('\n\n');
            if (!desc) desc = meta('description');
          }
          // 知乎视频页
          else if (url.includes('/zvideo/') || url.includes('/video/')) {
            desc = meta('description');
          }
          // 问答页：取问题描述 + 第一个回答
          else if (url.includes('/question/')) {
            const questionDesc = textFrom(['.QuestionRichText', '.QuestionHeader-detail']);
            const answer = textFrom(['.AnswerItem .RichContent-inner', '.AnswerItem .RichText', '.RichContent-inner']);
            const parts: string[] = [];
            if (questionDesc) parts.push(questionDesc);
            if (answer) parts.push(answer.slice(0, 2000));
            desc = parts.join('\n\n');
            if (!desc) desc = meta('description');
          }
          // 文章页
          else {
            desc = textFrom([
              '.Post-RichTextContainer', '.RichText', '.RichContent-inner',
            ]);
            if (desc.length > 2000) desc = desc.slice(0, 2000);
          }
        }
        // ── 今日头条 ──
        else if (host.includes('toutiao.com')) {
          title = textFrom([
            '.article-title', 'h1', '.title',
          ]) || document.title;
          desc = textFrom([
            '.article-content', '.article-detail',
          ]);
          if (!desc) desc = meta('description');
          if (desc.length > 2000) desc = desc.slice(0, 2000);
        }
        // ── Twitter/X ──
        else if (host.includes('twitter.com') || host.includes('x.com')) {
          title = document.title;
          desc = meta('og:description') || meta('description');
        }
        // ── LinkedIn ──
        else if (host.includes('linkedin.com')) {
          title = document.title;
          desc = meta('og:description') || meta('description');
        }
        // ── 通用 fallback ──
        else {
          title = document.title?.trim() ?? '';
          // 优先取 meta description
          desc = meta('og:description') || meta('description');
          if (!desc) {
            // 尝试常见正文容器，但只取前 2000 字
            const fallbackSelectors = [
              'article', '[role="main"]', 'main',
              '.article-content', '.post-content',
            ];
            desc = textFrom(fallbackSelectors);
            if (desc.length > 2000) desc = desc.slice(0, 2000);
          }
        }

        // 清理标题噪音
        title = (title || '')
          .replace(/^\s*\(\d+\s*封私信\)\s*/g, '')  // 去掉 "(14 封私信)" 前缀
          .replace(/^\s*\(\d+\s*条消息\)\s*/g, '')   // 去掉 "(3 条消息)" 前缀
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
        if ((title.length + (desc?.length || 0)) < MIN_LEN) {
          // 最后兜底：从正文容器取内容
          const bodySelectors = [
            'article', '[role="main"]', 'main',
            '.article-content', '.post-content', '.content',
            '.entry-content',
          ];
          const bodyText = textFrom(bodySelectors);
          if (bodyText.length > (desc?.length || 0)) {
            desc = bodyText.slice(0, 2000);
          }
        }
        // 终极兜底：取 body 可见文本
        if ((title.length + (desc?.length || 0)) < MIN_LEN) {
          const bodyInner = document.body?.innerText?.trim() ?? '';
          if (bodyInner.length > 0) {
            desc = bodyInner.slice(0, 2000);
          }
        }

        const combined = [title, desc].filter(Boolean).join('\n\n');
        const content = combined.slice(0, 5000);
        return { content, valid: content.length >= MIN_LEN };
      },
    });

    if (result && typeof result === 'object' && 'content' in result) {
      const { content, valid } = result as { content: string; valid: boolean };
      extractedContent = content;
      contentValid = valid;
      if (contentValid) {
        contentPreview.textContent = extractedContent.slice(0, 120) + (extractedContent.length > 120 ? '...' : '');
        contentPreview.classList.remove('invalid');
        btnGenerate.disabled = false;
        contentActions.classList.remove('hidden');
        contentExpanded = false;
        btnToggleContent.textContent = '展开全文';
      } else {
        contentPreview.textContent = '页面内容不足 50 字，请手动输入内容后生成';
        contentPreview.classList.add('invalid');
        btnGenerate.disabled = true;
      }
    }
  } catch (err) {
    contentPreview.textContent = '提取失败：' + (err as Error).message;
    contentPreview.classList.add('invalid');
  }
}

extractPageContent();

// ── Generate ──
btnGenerate.addEventListener('click', async () => {
  const platforms = Array.from(
    document.querySelectorAll<HTMLInputElement>('.platforms input:checked'),
  ).map((el) => el.value as PlatformCode);

  if (platforms.length === 0) {
    showError('请至少选择一个平台');
    return;
  }

  hideError();
  btnGenerate.disabled = true;
  btnGenerate.textContent = '生成中...';
  sectionResults.classList.add('hidden');

  try {
    const result = await generate({ content: extractedContent, platforms });
    renderResults(result.results);
    sectionResults.classList.remove('hidden');
  } catch (err) {
    showError((err as Error).message);
  } finally {
    btnGenerate.disabled = !contentValid;
    btnGenerate.textContent = '生成文案';
  }
});

function renderResults(results: Record<string, { title?: string; content: string }>): void {
  resultsList.innerHTML = '';
  for (const [platform, output] of Object.entries(results)) {
    const name = PLATFORM_NAMES[platform as PlatformCode] ?? platform;
    const text = typeof output === 'string' ? output : output.content;
    const title = typeof output === 'object' && output.title ? output.title : '';
    const displayText = title ? `${title}\n\n${text}` : text;
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div class="result-header">
        <span class="result-platform">${name}</span>
        <button class="btn-copy" data-text="${encodeURIComponent(displayText)}">复制</button>
      </div>
      <div class="result-body">${escapeHtml(displayText)}</div>
    `;
    resultsList.appendChild(item);
  }

  // Copy buttons
  resultsList.querySelectorAll<HTMLButtonElement>('.btn-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = decodeURIComponent(btn.dataset.text ?? '');
      await navigator.clipboard.writeText(text);
      btn.textContent = '已复制';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1500);
    });
  });
}

function showError(msg: string): void {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function hideError(): void {
  errorMsg.classList.add('hidden');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
