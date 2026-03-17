import { z } from 'zod';

export const teamNameSchema = z.object({
  name: z.string().min(1, '团队名称不能为空').max(100, '团队名称最长 100 字符'),
});

export type TeamNameValues = z.infer<typeof teamNameSchema>;

export const inviteFormSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  role: z.enum(['admin', 'member']).default('member'),
});

export type InviteFormValues = z.infer<typeof inviteFormSchema>;
