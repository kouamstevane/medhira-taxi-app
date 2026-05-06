import { z } from 'zod';

const TestManageUserSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(['add_role', 'remove_role']),
  role: z.enum(['driver', 'restaurant']),
});

describe('adminManageUser — ManageUserSchema', () => {
  test('accepts add_role driver', () => {
    const result = TestManageUserSchema.safeParse({
      userId: 'uid123',
      action: 'add_role',
      role: 'driver',
    });
    expect(result.success).toBe(true);
  });

  test('accepts remove_role restaurant', () => {
    const result = TestManageUserSchema.safeParse({
      userId: 'uid456',
      action: 'remove_role',
      role: 'restaurant',
    });
    expect(result.success).toBe(true);
  });

  test('rejects legacy role values (restaurateur, chauffeur, client)', () => {
    const legacyValues = ['client', 'restaurateur', 'chauffeur', 'admin'];
    for (const role of legacyValues) {
      const result = TestManageUserSchema.safeParse({
        userId: 'uid123',
        action: 'add_role',
        role,
      });
      expect(result.success).toBe(false);
    }
  });

  test('rejects unknown action', () => {
    const result = TestManageUserSchema.safeParse({
      userId: 'uid123',
      action: 'delete',
      role: 'driver',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing required fields', () => {
    const result = TestManageUserSchema.safeParse({
      action: 'add_role',
      role: 'driver',
    });
    expect(result.success).toBe(false);
  });
});
