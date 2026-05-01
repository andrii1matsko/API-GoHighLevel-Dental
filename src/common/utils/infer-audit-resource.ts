const RESOURCE_BY_SEGMENT: Record<string, string> = {
  'care-units': 'CareUnit',
  'health-services': 'HealthService',
  resources: 'Resource',
  auth: 'Auth',
  leyr: 'Leyr',
  gohighlevel: 'GoHighLevel',
  sync: 'CalendarSync',
};

export function inferResourceType(path: string): string | null {
  const normalized = path.replace(/^\/api\//, '');
  const first = normalized.split('/').filter(Boolean)[0];
  if (!first) {
    return null;
  }
  return RESOURCE_BY_SEGMENT[first] ?? first;
}

export function inferResourceId(path: string): string | null {
  const normalized = path.replace(/^\/api\//, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const last = parts[parts.length - 1];
  if (!last || last === 'docs' || last.includes('.')) {
    return null;
  }
  return last;
}

export function shouldAuditMutation(method: string, path: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return false;
  }
  const lower = path.toLowerCase();
  if (lower.includes('/health')) {
    return false;
  }
  if (lower.includes('/docs')) {
    return false;
  }
  return true;
}
