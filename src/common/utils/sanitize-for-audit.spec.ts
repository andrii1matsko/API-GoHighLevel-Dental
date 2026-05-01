import { sanitizeForAudit } from './sanitize-for-audit';

describe('sanitizeForAudit', () => {
  it('redacts sensitive keys recursively', () => {
    const input = {
      email: 'a@b.com',
      password: 'secret',
      nested: { apiKey: 'k', ok: 1 },
    };
    const out = sanitizeForAudit(input) as Record<string, unknown>;
    expect(out.password).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).apiKey).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect(out.email).toBe('a@b.com');
  });
});
