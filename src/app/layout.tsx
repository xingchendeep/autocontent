import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import PostHogProvider from '@/components/layout/PostHogProvider';
import Navbar from '@/components/layout/Navbar';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoContent Pro',
  description: '粘贴视频脚本，一键生成 10 大平台专属文案',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-zinc-50 text-zinc-900 antialiased">
        <PostHogProvider>
          <Navbar />
          {children}
        </PostHogProvider>
        <Analytics />
      </body>
    </html>
  );
}
