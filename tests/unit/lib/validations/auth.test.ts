import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  passwordSchema,
  registerFormSchema,
  loginFormSchema,
  forgotPasswordFormSchema,
  resetPasswordFormSchema,
} from '@/lib/validations/auth';

describe('emailSchema', () => {
  it('accepts a valid email', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = emailSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('请输入邮箱地址');
    }
  });

  it('rejects an invalid email format', () => {
    const result = emailSchema.safeParse('not-an-email');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('请输入有效的邮箱地址');
    }
  });
});

describe('passwordSchema', () => {
  it('accepts a valid password with letters and digits', () => {
    expect(passwordSchema.safeParse('abc12345').success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = passwordSchema.safeParse('ab1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('8');
    }
  });

  it('rejects a password with only digits', () => {
    const result = passwordSchema.safeParse('12345678');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('字母'))).toBe(true);
    }
  });

  it('rejects a password with only letters', () => {
    const result = passwordSchema.safeParse('abcdefgh');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('数字'))).toBe(true);
    }
  });
});

describe('registerFormSchema', () => {
  const validData = { email: 'a@b.com', password: 'abc12345', confirmPassword: 'abc12345' };

  it('accepts valid registration data', () => {
    expect(registerFormSchema.safeParse(validData).success).toBe(true);
  });

  it('rejects when passwords do not match', () => {
    const result = registerFormSchema.safeParse({ ...validData, confirmPassword: 'different1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('confirmPassword'));
      expect(issue?.message).toBe('两次输入的密码不一致');
    }
  });

  it('rejects when email is invalid', () => {
    const result = registerFormSchema.safeParse({ ...validData, email: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects when password is too short', () => {
    const result = registerFormSchema.safeParse({ ...validData, password: 'a1', confirmPassword: 'a1' });
    expect(result.success).toBe(false);
  });
});

describe('loginFormSchema', () => {
  it('accepts valid login data', () => {
    expect(loginFormSchema.safeParse({ email: 'a@b.com', password: 'anything' }).success).toBe(true);
  });

  it('rejects empty password', () => {
    const result = loginFormSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('请输入密码');
    }
  });
});

describe('forgotPasswordFormSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordFormSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(forgotPasswordFormSchema.safeParse({ email: '' }).success).toBe(false);
  });
});

describe('resetPasswordFormSchema', () => {
  const validData = { password: 'abc12345', confirmPassword: 'abc12345' };

  it('accepts valid reset data', () => {
    expect(resetPasswordFormSchema.safeParse(validData).success).toBe(true);
  });

  it('rejects when passwords do not match', () => {
    const result = resetPasswordFormSchema.safeParse({ ...validData, confirmPassword: 'different1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('confirmPassword'));
      expect(issue?.message).toBe('两次输入的密码不一致');
    }
  });

  it('rejects a weak password', () => {
    const result = resetPasswordFormSchema.safeParse({ password: '1234', confirmPassword: '1234' });
    expect(result.success).toBe(false);
  });
});
