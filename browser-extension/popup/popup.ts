import { generate, type PlatformCode } from '../utils/api';
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

// ── Actively inject and extract page content when popup opens ──
async function extractPageContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      contentPreview.textContent = '无法获取当前标签页';
      contentPreview.classList.add('invalid');
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const MIN_LEN = 50;
        const title = document.title?.trim() ?? '';
        const selectors = [
          'article', '[role="main"]', 'main', '.article-content',
          '.post-content', '.video-desc', '.desc-info-text',
          '#video-desc', '.content', '.entry-content',
          '#js_content', '.Post-RichText', '.RichContent-inner',
        ];
        let body = '';
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent && el.textContent.trim().length > 30) {
            body = el.textContent.trim();
            break;
          }
        }
        if (!body) body = document.body?.innerText?.trim() ?? '';
        const combined = title ? `${title}\n\n${body}` : body;
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
