'use client';

import { useState } from 'react';

export function ApiGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <h2 className="text-sm font-semibold text-zinc-900">API 使用指引</h2>
      <div className="mt-2 space-y-2 text-xs text-zinc-600">
        <p>
          端点：<code className="rounded bg-white px-1.5 py-0.5 font-mono text-zinc-800">POST /api/v1/generate</code>
        </p>
        <p>
          认证：在请求头中添加 <code className="rounded bg-white px-1.5 py-0.5 font-mono text-zinc-800">Authorization: Bearer acp_your_key</code>
        </p>
        <p>
          限流：每个 Key 每分钟 10 次请求
        </p>
      </div>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-3 text-xs text-blue-600 hover:underline"
      >
        {expanded ? '收起示例' : '查看 curl 示例'}
      </button>

      {expanded && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-900 p-3 text-xs text-zinc-100">
{`curl -X POST https://your-domain.com/api/v1/generate \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer acp_your_key" \\
  -d '{
    "content": "你的视频脚本内容",
    "platforms": ["douyin", "xiaohongshu"]
  }'`}
        </pre>
      )}
    </div>
  );
}
