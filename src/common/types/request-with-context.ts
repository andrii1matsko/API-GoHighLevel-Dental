import type { Request } from 'express';

export type RequestWithContext = Request & {
  correlationId?: string;
  auditStartMs?: number;
};
