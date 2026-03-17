import { z } from 'zod';

export const batchFormSchema = z.object({
  items: z
    .array(z.object({ content: z.string().min(1, '内容不能为空') }))
    .min(1, '至少添加一条内容')
    .max(50, '最多 50 条内容'),
  platforms: z.array(z.string()).min(1, '至少选择一个平台'),
  templateId: z.string().uuid().optional(),
});

export type BatchFormValues = z.infer<typeof batchFormSchema>;
