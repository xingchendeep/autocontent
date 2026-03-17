import { z } from 'zod';

export const templateFormSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称最长 100 字符'),
  tone: z.enum(['professional', 'casual', 'humorous', 'authoritative', 'empathetic']),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  customInstructions: z.string().max(2000, '自定义指令最长 2000 字符').optional(),
});

export type TemplateFormValues = z.infer<typeof templateFormSchema>;
