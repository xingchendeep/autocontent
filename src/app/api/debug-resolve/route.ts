import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

/**
 * Temporary debug endpoint to test video URL resolution from Vercel
 * DELETE THIS AFTER DEBUGGING
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get('url') || 'https://www.bilibili.com/video/BV1GJ411x7h7';
  const results: Record<string, unknown> = { url, timestamp: new Date().toISOString() };

  // Test 1: Bilibili view API
  try {
    const bvMatch = url.match(/\/video\/(BV[\w]+)/i);
    if (bvMatch) {
      const bvid = bvMatch[1];
      const viewRes = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://www.bilibili.com',
          },
        },
      );
      const viewJson = await viewRes.json() as { code: number; message: string; data?: { cid?: number; title?: string } };
      results.bilibili_view = { status: viewRes.status, code: viewJson.code, message: viewJson.message, cid: viewJson.data?.cid, title: viewJson.data?.title };

      if (viewJson.data?.cid) {
        const playRes = await fetch(
          `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${viewJson.data.cid}&fnval=16`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              Referer: 'https://www.bilibili.com',
            },
          },
        );
        const playJson = await playRes.json() as { code: number; data?: { dash?: { audio?: Array<{ baseUrl: string }> }; durl?: Array<{ url: string }> } };
        const audioUrl = playJson.data?.dash?.audio?.[0]?.baseUrl;
        const durlUrl = playJson.data?.durl?.[0]?.url;
        results.bilibili_play = { code: playJson.code, hasAudio: !!audioUrl, hasDurl: !!durlUrl, audioUrl: audioUrl?.slice(0, 120) };
      }
    }
  } catch (e) {
    results.bilibili_error = (e as Error).message;
  }

  // Test 2: Douyin share page
  try {
    const douyinMatch = url.match(/\/video\/(\d+)/);
    if (douyinMatch || url.includes('douyin')) {
      const awemeId = douyinMatch?.[1] || '7456580480917498147';
      const shareUrl = `https://www.iesdouyin.com/share/video/${awemeId}/`;
      const res = await fetch(shareUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        },
        redirect: 'follow',
      });
      const html = await res.text();
      const vodPat = /https?:\/\/[^"'\s\\]+?(?:douyinvod|v\d+-[a-z]+\.douyinvod)[^"'\s\\]*/gi;
      const vodMatches = html.match(vodPat);
      results.douyin = { status: res.status, htmlLength: html.length, vodUrlsFound: vodMatches?.length ?? 0, firstVodUrl: vodMatches?.[0]?.slice(0, 120) };
    }
  } catch (e) {
    results.douyin_error = (e as Error).message;
  }

  return NextResponse.json(results);
}
