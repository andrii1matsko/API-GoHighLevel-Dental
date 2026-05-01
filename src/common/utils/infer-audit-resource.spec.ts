import {
  inferResourceId,
  inferResourceType,
  shouldAuditMutation,
} from './infer-audit-resource';

describe('infer-audit-resource', () => {
  it('maps API segments to resource types', () => {
    expect(inferResourceType('/api/care-units')).toBe('CareUnit');
    expect(inferResourceType('/api/auth/login')).toBe('Auth');
  });

  it('extracts trailing id segment', () => {
    expect(inferResourceId('/api/care-units/cu_1')).toBe('cu_1');
    expect(inferResourceId('/api/care-units')).toBeNull();
  });

  it('skips audit for health and docs', () => {
    expect(shouldAuditMutation('POST', '/api/health/db')).toBe(false);
    expect(shouldAuditMutation('POST', '/api/docs')).toBe(false);
    expect(shouldAuditMutation('POST', '/api/auth/login')).toBe(true);
    expect(shouldAuditMutation('GET', '/api/care-units')).toBe(false);
  });
});
