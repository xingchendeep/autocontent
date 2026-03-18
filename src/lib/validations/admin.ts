import { z } from 'zod';

// --- Site settings ---

export const updateSiteSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1, 'key 不能为空'),
        value: z.string().min(1, 'value 不能为空').max(2000, 'value 最长 2000 字符'),
      }),
    )
    .min(1, '至少提供一个设置项'),
});

export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;

// --- User management ---

export const updateUserSchema = z
  .object({
    isDisabled: z.boolean().optional(),
    role: z.enum(['user', 'admin', 'super_admin']).optional(),
  })
  .refine((data) => data.isDisabled !== undefined || data.role !== undefined, {
    message: '至少提供 isDisabled 或 role 中的一个字段',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateUserSubscriptionSchema = z.object({
  planCode: z.string().min(1, 'planCode 不能为空'),
});

export type UpdateUserSubscriptionInput = z.infer<typeof updateUserSubscriptionSchema>;

// --- System template ---

export const updateSystemTemplateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  promptInstructions: z.string().min(1, '提示词不能为空').optional(),
  maxTitleLength: z.number().int().min(0, '标题长度不能为负数').optional(),
  maxContentLength: z.number().int().min(0, '内容长度不能为负数').optional(),
  hashtagStyle: z.enum(['inline', 'trailing', 'none']).optional(),
  promptVersion: z.string().min(1).max(50).optional(),
});

export type UpdateSystemTemplateInput = z.infer<typeof updateSystemTemplateSchema>;

// --- Blocked keywords ---

export const addKeywordSchema = z.object({
  keyword: z.string().min(1, '关键词不能为空').max(100, '关键词最长 100 字符'),
  category: z.string().max(50).default('general'),
});

export type AddKeywordInput = z.infer<typeof addKeywordSchema>;

// --- System config ---

export const updateSystemConfigSchema = z.object({
  configs: z
    .array(
      z.object({
        key: z.string().min(1, 'key 不能为空'),
        value: z.string().min(1, 'value 不能为空'),
      }),
    )
    .min(1, '至少提供一个配置项'),
});

export type UpdateSystemConfigInput = z.infer<typeof updateSystemConfigSchema>;

// --- Pagination query params ---

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
