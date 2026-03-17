import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

type RouteContext = { params: Promise<{ fileId: string }> };

/**
 * GET /api/extract/tmp/:fileId
 * 临时文件下载接口，供 DashScope ASR 服务下载视频
 * fileId 格式为 UUID，只允许字母数字和连字符
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { fileId } = await ctx.params;

  // 安全校验：只允许 UUID 格式
  if (!/^[a-f0-9-]{36}$/.test(fileId)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const filePath = join(process.cwd(), '.tmp', 'videos', `${fileId}.mp4`);

  if (!existsSync(filePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('Internal Error', { status: 500 });
  }
}
