import type { PlatformCode } from '@/types';

export interface PlatformTemplate {
  platform: PlatformCode;
  displayName: string;
  promptInstructions: string;
  maxTitleLength: number;
  maxContentLength: number;
  hashtagStyle: 'inline' | 'trailing' | 'none';
  promptVersion: string;
}

export const SUPPORTED_PLATFORMS: PlatformCode[] = [
  'douyin',
  'xiaohongshu',
  'bilibili',
  'weibo',
  'wechat',
  'twitter',
  'linkedin',
  'kuaishou',
  'zhihu',
  'toutiao',
];

export const PLATFORM_TEMPLATES: Record<PlatformCode, PlatformTemplate> = {
  douyin: {
    platform: 'douyin',
    displayName: '抖音',
    promptInstructions:
      '为抖音短视频生成文案。标题要吸引眼球、有悬念感，正文简短有力（150字以内），结尾加互动引导语。使用流行话题标签，风格活泼年轻。',
    maxTitleLength: 30,
    maxContentLength: 150,
    hashtagStyle: 'trailing',
    promptVersion: 'v1',
  },
  xiaohongshu: {
    platform: 'xiaohongshu',
    displayName: '小红书',
    promptInstructions:
      '为小红书生成图文笔记文案。标题加emoji，正文分段清晰（300字以内），语气亲切真实，像朋友分享。标签用#话题#格式穿插在正文中。',
    maxTitleLength: 20,
    maxContentLength: 300,
    hashtagStyle: 'inline',
    promptVersion: 'v1',
  },
  bilibili: {
    platform: 'bilibili',
    displayName: 'B站',
    promptInstructions:
      '为B站视频生成简介文案。标题专业且有信息量，正文介绍视频核心内容（200字以内），可加时间轴提示，语气偏向知识分享型。',
    maxTitleLength: 80,
    maxContentLength: 200,
    hashtagStyle: 'trailing',
    promptVersion: 'v1',
  },
  weibo: {
    platform: 'weibo',
    displayName: '微博',
    promptInstructions:
      '为微博生成帖子文案。内容简洁有观点（140字以内），可加话题标签#话题#，语气轻松，适合引发讨论和转发。',
    maxTitleLength: 0,
    maxContentLength: 140,
    hashtagStyle: 'inline',
    promptVersion: 'v1',
  },
  wechat: {
    platform: 'wechat',
    displayName: '微信公众号',
    promptInstructions:
      '为微信公众号生成推文文案。标题有吸引力，正文结构清晰（500字以内），语气专业但不失温度，适合深度阅读，结尾引导关注或分享。',
    maxTitleLength: 64,
    maxContentLength: 500,
    hashtagStyle: 'none',
    promptVersion: 'v1',
  },
  twitter: {
    platform: 'twitter',
    displayName: 'Twitter / X',
    promptInstructions:
      'Generate a Twitter/X post. Keep it under 280 characters, punchy and direct. Use 1-2 relevant hashtags at the end. English preferred unless content is Chinese.',
    maxTitleLength: 0,
    maxContentLength: 280,
    hashtagStyle: 'trailing',
    promptVersion: 'v1',
  },
  linkedin: {
    platform: 'linkedin',
    displayName: 'LinkedIn',
    promptInstructions:
      'Generate a LinkedIn post. Professional tone, insightful and value-driven (300 words max). Start with a hook, use short paragraphs, end with a question or call to action. 3-5 hashtags at the end.',
    maxTitleLength: 0,
    maxContentLength: 700,
    hashtagStyle: 'trailing',
    promptVersion: 'v1',
  },
  kuaishou: {
    platform: 'kuaishou',
    displayName: '快手',
    promptInstructions:
      '为快手短视频生成文案。标题接地气、有共鸣感，正文简短直白（100字以内），语气朴实亲切，贴近下沉市场用户，结尾加互动引导。',
    maxTitleLength: 30,
    maxContentLength: 100,
    hashtagStyle: 'trailing',
    promptVersion: 'v1',
  },
  zhihu: {
    platform: 'zhihu',
    displayName: '知乎',
    promptInstructions:
      '为知乎生成回答或文章文案。标题是问题或观点式，正文逻辑严谨、有数据或案例支撑（400字以内），语气理性专业，适合知识型读者。',
    maxTitleLength: 50,
    maxContentLength: 400,
    hashtagStyle: 'none',
    promptVersion: 'v1',
  },
  toutiao: {
    platform: 'toutiao',
    displayName: '今日头条',
    promptInstructions:
      '为今日头条生成资讯文章文案。标题有新闻感、数字或悬念，正文信息密度高（300字以内），语气客观中立，适合大众阅读。',
    maxTitleLength: 30,
    maxContentLength: 300,
    hashtagStyle: 'none',
    promptVersion: 'v1',
  },
};
