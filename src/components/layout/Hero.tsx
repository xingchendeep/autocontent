import { getSiteSettingWithDefault } from '@/lib/admin/site-settings';

export default async function Hero() {
  const heroTitle = await getSiteSettingWithDefault('hero_title', 'AutoContent Pro');
  const heroDescription = await getSiteSettingWithDefault(
    'hero_description',
    '粘贴视频音频链接（B站/抖音/快手等）、上传本地音视频文件、粘贴文本\n自动提取全部语音、文字内容，一键生成10大平台专属文案，三十秒搞定。',
  );

  return (
    <div className="flex flex-col gap-2 py-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
        {heroTitle}
      </h1>
      <p className="whitespace-pre-line text-base leading-relaxed text-zinc-500">
        {heroDescription}
      </p>
    </div>
  );
}
