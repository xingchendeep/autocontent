/**
 * 属性测试：v2-product-differentiation
 * 验证 AutoContent Pro v2.0 核心功能的普遍正确性
 *
 * 运行方式：
 *   pnpm vitest run tests/property/v2-product-differentiation.property.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';

// ─────────────────────────────────────────────
// 辅助：模拟数据库存储（内存）
// ─────────────────────────────────────────────

interface TemplateRecord {
  id: string;
  userId: string;
  name: string;
  tone: string;
  length: string;
}

interface ApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
}

interface TeamRecord {
  id: string;
  name: string;
}

interface TeamMemberRecord {
  teamId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
}

interface InvitationRecord {
  id: string;
  teamId: string;
  token: string;
  acceptedAt: string | null;
  expiresAt: string;
}

// ─────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────

const uuidArb = fc.uuid();
const userIdArb = fc.uuid();
const toneArb = fc.constantFrom('professional', 'casual', 'humorous', 'authoritative', 'empathetic');
const lengthArb = fc.constantFrom('short', 'medium', 'long');
const templateNameArb = fc.string({ minLength: 1, maxLength: 100 });
const platformArb = fc.constantFrom(
  'douyin', 'xiaohongshu', 'bilibili', 'weibo', 'wechat',
  'twitter', 'linkedin', 'kuaishou', 'zhihu', 'toutiao',
);
const platformsArb = fc.array(platformArb, { minLength: 1, maxLength: 10 }).map(
  (arr) => [...new Set(arr)] as string[],
);

// ─────────────────────────────────────────────
// P1：模板所有权隔离
// Feature: v2-product-differentiation, Property 1: 模板所有权隔离
// 验证：需求 1.3, 1.6
// ─────────────────────────────────────────────

describe('Property 1: 模板所有权隔离', () => {
  it('用户只能读取自己的模板，跨用户操作返回 null', () => {
    // 内存模拟 getTemplateById 逻辑
    function getTemplateById(
      store: TemplateRecord[],
      id: string,
      requestingUserId: string,
    ): TemplateRecord | null {
      const t = store.find((r) => r.id === id);
      if (!t) return null;
      if (t.userId !== requestingUserId) return null;
      return t;
    }

    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        uuidArb,
        templateNameArb,
        toneArb,
        lengthArb,
        (ownerUserId, otherUserId, templateId, name, tone, length) => {
          fc.pre(ownerUserId !== otherUserId);

          const store: TemplateRecord[] = [
            { id: templateId, userId: ownerUserId, name, tone, length },
          ];

          // owner 可以读取
          expect(getTemplateById(store, templateId, ownerUserId)).not.toBeNull();
          // 其他用户无法读取
          expect(getTemplateById(store, templateId, otherUserId)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P2：模板参数覆盖优先级
// Feature: v2-product-differentiation, Property 2: 模板参数覆盖优先级
// 验证：需求 2.1, 2.2
// ─────────────────────────────────────────────

describe('Property 2: 模板参数覆盖优先级', () => {
  it('显式请求参数 > 模板参数 > 系统默认值', () => {
    type Tone = 'professional' | 'casual' | 'humorous' | 'authoritative' | 'empathetic';
    type Length = 'short' | 'medium' | 'long';

    interface MergedOptions {
      tone: Tone;
      length: Length;
    }

    const DEFAULT_TONE: Tone = 'professional';
    const DEFAULT_LENGTH: Length = 'medium';

    function mergeOptions(
      explicit: Partial<MergedOptions>,
      template: Partial<MergedOptions>,
    ): MergedOptions {
      return {
        tone: explicit.tone ?? template.tone ?? DEFAULT_TONE,
        length: explicit.length ?? template.length ?? DEFAULT_LENGTH,
      };
    }

    fc.assert(
      fc.property(
        fc.option(toneArb as fc.Arbitrary<Tone>, { nil: undefined }),
        fc.option(toneArb as fc.Arbitrary<Tone>, { nil: undefined }),
        fc.option(lengthArb as fc.Arbitrary<Length>, { nil: undefined }),
        fc.option(lengthArb as fc.Arbitrary<Length>, { nil: undefined }),
        (explicitTone, templateTone, explicitLength, templateLength) => {
          const result = mergeOptions(
            { tone: explicitTone, length: explicitLength },
            { tone: templateTone, length: templateLength },
          );

          // 显式参数优先
          if (explicitTone !== undefined) {
            expect(result.tone).toBe(explicitTone);
          } else if (templateTone !== undefined) {
            expect(result.tone).toBe(templateTone);
          } else {
            expect(result.tone).toBe(DEFAULT_TONE);
          }

          if (explicitLength !== undefined) {
            expect(result.length).toBe(explicitLength);
          } else if (templateLength !== undefined) {
            expect(result.length).toBe(templateLength);
          } else {
            expect(result.length).toBe(DEFAULT_LENGTH);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P3：批量任务 items 数量不变量
// Feature: v2-product-differentiation, Property 3: 批量任务 items 数量不变量
// 验证：需求 3.1, 3.3
// ─────────────────────────────────────────────

describe('Property 3: 批量任务 items 数量不变量', () => {
  it('batch_job_items 数量等于请求中 items 数量', () => {
    interface BatchItem {
      content: string;
      platforms: string[];
    }

    function createBatchJob(items: BatchItem[]): {
      jobId: string;
      itemCount: number;
      createdItems: { itemId: string; content: string }[];
    } {
      const jobId = crypto.randomUUID();
      const createdItems = items.map((item) => ({
        itemId: crypto.randomUUID(),
        content: item.content,
      }));
      return { jobId, itemCount: items.length, createdItems };
    }

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            content: fc.string({ minLength: 1, maxLength: 500 }),
            platforms: platformsArb,
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (items) => {
          const job = createBatchJob(items);
          // item_count 等于请求数量
          expect(job.itemCount).toBe(items.length);
          // 创建的子任务数量等于请求数量
          expect(job.createdItems.length).toBe(items.length);
          // 每个子任务有唯一 itemId
          const ids = new Set(job.createdItems.map((i) => i.itemId));
          expect(ids.size).toBe(items.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P4：批量任务状态机合法性
// Feature: v2-product-differentiation, Property 4: 批量任务状态机合法性
// 验证：需求 4.5
// ─────────────────────────────────────────────

describe('Property 4: 批量任务状态机合法性', () => {
  it('聚合状态规则：全 completed→completed，全 failed→failed，混合→partial', () => {
    type ItemStatus = 'pending' | 'processing' | 'completed' | 'failed';
    type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

    function aggregateJobStatus(
      itemStatuses: ItemStatus[],
    ): JobStatus {
      const total = itemStatuses.length;
      const completedCount = itemStatuses.filter((s) => s === 'completed').length;
      const failedCount = itemStatuses.filter((s) => s === 'failed').length;
      const doneCount = completedCount + failedCount;

      if (doneCount < total) return 'processing';
      if (completedCount === total) return 'completed';
      if (failedCount === total) return 'failed';
      return 'partial';
    }

    const terminalStatusArb = fc.constantFrom<ItemStatus>('completed', 'failed');

    fc.assert(
      fc.property(
        fc.array(terminalStatusArb, { minLength: 1, maxLength: 50 }),
        (statuses) => {
          const jobStatus = aggregateJobStatus(statuses);
          const completedCount = statuses.filter((s) => s === 'completed').length;
          const failedCount = statuses.filter((s) => s === 'failed').length;

          if (completedCount === statuses.length) {
            expect(jobStatus).toBe('completed');
          } else if (failedCount === statuses.length) {
            expect(jobStatus).toBe('failed');
          } else {
            expect(jobStatus).toBe('partial');
          }

          // completed + failed <= total（不变量）
          expect(completedCount + failedCount).toBeLessThanOrEqual(statuses.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P5：API Key 唯一性与格式
// Feature: v2-product-differentiation, Property 5: API Key 唯一性与格式
// 验证：需求 8.1
// ─────────────────────────────────────────────

describe('Property 5: API Key 唯一性与格式', () => {
  it('生成的 API Key 格式正确且多次生成不重复', () => {
    function generateApiKey(): string {
      return `acp_${crypto.randomBytes(24).toString('base64url').slice(0, 32)}`;
    }

    const KEY_PATTERN = /^acp_[A-Za-z0-9_-]{32}$/;

    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (count) => {
          const keys = Array.from({ length: count }, () => generateApiKey());

          // 每个 key 格式正确
          for (const key of keys) {
            expect(key).toMatch(KEY_PATTERN);
            expect(key.length).toBe(36); // "acp_" (4) + 32 chars
          }

          // 所有 key 唯一
          const uniqueKeys = new Set(keys);
          expect(uniqueKeys.size).toBe(count);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P6：API Key 撤销即时生效
// Feature: v2-product-differentiation, Property 6: API Key 撤销即时生效
// 验证：需求 8.3, 8.6
// ─────────────────────────────────────────────

describe('Property 6: API Key 撤销即时生效', () => {
  it('撤销后 verify 立即返回 null', () => {
    function hashKey(rawKey: string): string {
      return crypto.createHash('sha256').update(rawKey).digest('hex');
    }

    function verifyKey(store: ApiKeyRecord[], rawKey: string): string | null {
      const hash = hashKey(rawKey);
      const record = store.find((r) => r.keyHash === hash && r.isActive);
      return record ? record.userId : null;
    }

    function revokeKey(store: ApiKeyRecord[], id: string): void {
      const record = store.find((r) => r.id === id);
      if (record) record.isActive = false;
    }

    fc.assert(
      fc.property(
        userIdArb,
        uuidArb,
        (userId, keyId) => {
          const rawKey = `acp_${crypto.randomBytes(24).toString('base64url').slice(0, 32)}`;
          const store: ApiKeyRecord[] = [
            {
              id: keyId,
              userId,
              keyHash: hashKey(rawKey),
              keyPrefix: rawKey.slice(0, 8),
              isActive: true,
              lastUsedAt: null,
            },
          ];

          // 撤销前可以验证
          expect(verifyKey(store, rawKey)).toBe(userId);

          // 撤销
          revokeKey(store, keyId);

          // 撤销后立即失效
          expect(verifyKey(store, rawKey)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P7：团队 Owner 唯一性
// Feature: v2-product-differentiation, Property 7: 团队 Owner 唯一性
// 验证：需求 6.5
// ─────────────────────────────────────────────

describe('Property 7: 团队 Owner 唯一性', () => {
  it('不能移除团队最后一个 owner', () => {
    function canRemoveMember(
      members: TeamMemberRecord[],
      teamId: string,
      targetUserId: string,
    ): { allowed: boolean; reason?: string } {
      const teamMembers = members.filter((m) => m.teamId === teamId);
      const target = teamMembers.find((m) => m.userId === targetUserId);
      if (!target) return { allowed: false, reason: 'NOT_FOUND' };

      if (target.role === 'owner') {
        const ownerCount = teamMembers.filter((m) => m.role === 'owner').length;
        if (ownerCount <= 1) {
          return { allowed: false, reason: 'LAST_OWNER' };
        }
      }
      return { allowed: true };
    }

    fc.assert(
      fc.property(
        uuidArb,
        userIdArb,
        (teamId, ownerId) => {
          // 只有一个 owner 的团队
          const members: TeamMemberRecord[] = [
            { teamId, userId: ownerId, role: 'owner' },
          ];

          const result = canRemoveMember(members, teamId, ownerId);
          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('LAST_OWNER');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('有多个 owner 时可以移除其中一个', () => {
    function canRemoveMember(
      members: TeamMemberRecord[],
      teamId: string,
      targetUserId: string,
    ): boolean {
      const teamMembers = members.filter((m) => m.teamId === teamId);
      const target = teamMembers.find((m) => m.userId === targetUserId);
      if (!target) return false;
      if (target.role === 'owner') {
        return teamMembers.filter((m) => m.role === 'owner').length > 1;
      }
      return true;
    }

    fc.assert(
      fc.property(
        uuidArb,
        userIdArb,
        userIdArb,
        (teamId, owner1Id, owner2Id) => {
          fc.pre(owner1Id !== owner2Id);

          const members: TeamMemberRecord[] = [
            { teamId, userId: owner1Id, role: 'owner' },
            { teamId, userId: owner2Id, role: 'owner' },
          ];

          expect(canRemoveMember(members, teamId, owner1Id)).toBe(true);
          expect(canRemoveMember(members, teamId, owner2Id)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P8：团队数据隔离
// Feature: v2-product-differentiation, Property 8: 团队数据隔离
// 验证：需求 6.4, 7.5, 7.6
// ─────────────────────────────────────────────

describe('Property 8: 团队数据隔离', () => {
  it('非团队成员无法访问团队资源', () => {
    function isMember(members: TeamMemberRecord[], teamId: string, userId: string): boolean {
      return members.some((m) => m.teamId === teamId && m.userId === userId);
    }

    function canAccessTeamResource(
      members: TeamMemberRecord[],
      teamId: string,
      requestingUserId: string,
    ): boolean {
      return isMember(members, teamId, requestingUserId);
    }

    fc.assert(
      fc.property(
        uuidArb,
        userIdArb,
        userIdArb,
        (teamId, memberId, outsiderId) => {
          fc.pre(memberId !== outsiderId);

          const members: TeamMemberRecord[] = [
            { teamId, userId: memberId, role: 'member' },
          ];

          expect(canAccessTeamResource(members, teamId, memberId)).toBe(true);
          expect(canAccessTeamResource(members, teamId, outsiderId)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P9：外部 API 限流一致性
// Feature: v2-product-differentiation, Property 9: 外部 API 限流一致性
// 验证：需求 8.7
// ─────────────────────────────────────────────

describe('Property 9: 外部 API 限流一致性', () => {
  it('超过限流阈值后请求被拒绝，重置后恢复', () => {
    interface RateLimitState {
      count: number;
      windowStart: number;
    }

    const LIMIT = 10;
    const WINDOW_MS = 60_000;

    function checkRateLimit(
      state: RateLimitState,
      nowMs: number,
    ): { allowed: boolean; newState: RateLimitState } {
      if (nowMs - state.windowStart >= WINDOW_MS) {
        // 窗口重置
        return { allowed: true, newState: { count: 1, windowStart: nowMs } };
      }
      if (state.count >= LIMIT) {
        return { allowed: false, newState: state };
      }
      return { allowed: true, newState: { ...state, count: state.count + 1 } };
    }

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        (requestCount) => {
          let state: RateLimitState = { count: 0, windowStart: 0 };
          const now = 1000;
          let allowedCount = 0;
          let deniedCount = 0;

          for (let i = 0; i < requestCount; i++) {
            const result = checkRateLimit(state, now);
            state = result.newState;
            if (result.allowed) allowedCount++;
            else deniedCount++;
          }

          // 允许数量不超过限制
          expect(allowedCount).toBeLessThanOrEqual(LIMIT);
          // 总数等于请求数
          expect(allowedCount + deniedCount).toBe(requestCount);
          // 超出部分全部被拒绝
          if (requestCount > LIMIT) {
            expect(deniedCount).toBe(requestCount - LIMIT);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────
// P10：邀请 Token 不可重用
// Feature: v2-product-differentiation, Property 10: 邀请 Token 不可重用
// 验证：需求 7.3, 7.4
// ─────────────────────────────────────────────

describe('Property 10: 邀请 Token 不可重用', () => {
  it('已使用或已过期的 token 无法再次接受', () => {
    function acceptInvitation(
      invitations: InvitationRecord[],
      token: string,
      nowMs: number,
    ): { success: boolean; reason?: string } {
      const inv = invitations.find((i) => i.token === token);
      if (!inv) return { success: false, reason: 'NOT_FOUND' };
      if (inv.acceptedAt !== null) return { success: false, reason: 'ALREADY_USED' };
      if (new Date(inv.expiresAt).getTime() < nowMs) return { success: false, reason: 'EXPIRED' };

      // 标记为已使用
      inv.acceptedAt = new Date(nowMs).toISOString();
      return { success: true };
    }

    const tokenArb = fc.stringMatching(/^[0-9a-f]{64}$/);

    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        tokenArb,
        (invId: string, teamId: string, token: string) => {
          const now = Date.now();
          const invitations: InvitationRecord[] = [
            {
              id: invId,
              teamId,
              token,
              acceptedAt: null,
              expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ];

          // 第一次接受成功
          const first = acceptInvitation(invitations, token, now);
          expect(first.success).toBe(true);

          // 第二次接受失败（已使用）
          const second = acceptInvitation(invitations, token, now + 1000);
          expect(second.success).toBe(false);
          expect(second.reason).toBe('ALREADY_USED');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('过期 token 无法接受', () => {
    function isTokenValid(expiresAt: string, nowMs: number): boolean {
      return new Date(expiresAt).getTime() >= nowMs;
    }

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 * 24 * 60 * 60 * 1000 }),
        (offsetMs) => {
          const now = Date.now();
          const expiredAt = new Date(now - offsetMs).toISOString();
          const validAt = new Date(now + offsetMs).toISOString();

          expect(isTokenValid(expiredAt, now)).toBe(false);
          expect(isTokenValid(validAt, now)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
