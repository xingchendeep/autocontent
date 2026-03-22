'use client';

import { useEffect, useState } from 'react';

export default function Hero() {
  const [title, setTitle] = useState('AutoContent Pro');
  const [description, setDescription] = useState(
    '粘贴视频音频链接（B站/抖音/快手等）、上传本地音视频文件、粘贴文本\n自动提取全部语音、文字内容，一键生成10大平台专属文案，三十秒搞定。',
  );

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          if (json.data.hero_title) setTitle(json.data.hero_title);
          if (json.data.hero_description) setDescription(json.data.hero_description);
        }
      })
      .catch(() => { /* use defaults */ });
  }, []);

  return (
    <div className="flex flex-col gap-2 py-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
        {title}
      </h1>
      <p className="whitespace-pre-line text-base leading-relaxed text-zinc-500">
        {description}
      </p>
    </div>
  );
}
