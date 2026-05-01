import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { RequestWithContext } from '../types/request-with-context';
import { AuditLogService } from '../services/audit-log.service';
import {
  inferResourceId,
  inferResourceType,
  shouldAuditMutation,
} from '../utils/infer-audit-resource';
import { sanitizeForAudit } from '../utils/sanitize-for-audit';

const METADATA_MAX_JSON = 12_000;

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ObservabilityInterceptor.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly jwtService: JwtService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithContext>();
    const res = http.getResponse<Response>();
    const started = Date.now();
    req.auditStartMs = started;

    return next.handle().pipe(
      tap({
        next: () => {
          this.logHttpLine(req, res, started);
          void this.persistAudit(req, res, started);
        },
        error: (err: unknown) => {
          this.logHttpLine(req, res, started, err);
          void this.persistAudit(req, res, started, err);
        },
      }),
    );
  }

  private logHttpLine(
    req: RequestWithContext,
    res: Response,
    started: number,
    err?: unknown,
  ): void {
    const durationMs = Date.now() - started;
    let statusCode = res.statusCode;
    if (err) {
      statusCode =
        err instanceof HttpException ? err.getStatus() : (statusCode || 500);
    }

    const base = {
      requestId: req.correlationId,
      method: req.method,
      path: req.originalUrl ?? req.url,
      statusCode,
      durationMs,
      ip: req.ip,
    };

    if (process.env.LOG_FORMAT === 'json') {
      const line = JSON.stringify({ level: 'http', ts: new Date().toISOString(), ...base });
      if (statusCode >= 500) {
        this.logger.error(line);
      } else if (statusCode >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
      return;
    }

    const msg = `${base.method} ${base.path} ${base.statusCode} ${base.durationMs}ms requestId=${base.requestId ?? 'n/a'}`;
    if (statusCode >= 500) {
      this.logger.error(msg);
    } else if (statusCode >= 400) {
      this.logger.warn(msg);
    } else {
      this.logger.log(msg);
    }
  }

  private async persistAudit(
    req: RequestWithContext,
    res: Response,
    started: number,
    err?: unknown,
  ): Promise<void> {
    if (!shouldAuditMutation(req.method, req.originalUrl ?? req.url)) {
      return;
    }

    const path = req.originalUrl ?? req.url;
    let statusCode = res.statusCode;
    if (err) {
      statusCode =
        err instanceof HttpException ? err.getStatus() : (statusCode || 500);
    }

    const actor = await this.resolveActor(req.headers.authorization);
    const metadata = this.buildMetadata(req, err);

    await this.auditLogService.record({
      actorUserId: actor.sub ?? undefined,
      actorEmail: actor.email ?? undefined,
      httpMethod: req.method,
      path,
      resourceType: inferResourceType(path),
      resourceId: inferResourceId(path),
      ip: req.ip ?? undefined,
      userAgent: typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined,
      requestId: req.correlationId,
      statusCode,
      durationMs: Date.now() - started,
      metadata: metadata as object | undefined,
    });
  }

  private buildMetadata(req: RequestWithContext, err?: unknown): unknown {
    const query = sanitizeForAudit(req.query);
    let bodyField: unknown = sanitizeForAudit(req.body);
    const bodyJson = JSON.stringify(bodyField);
    if (bodyJson.length > 6_000) {
      bodyField = {
        _truncated: true,
        length: bodyJson.length,
      };
    }

    const payload: Record<string, unknown> = { query, body: bodyField };
    if (err instanceof HttpException) {
      const response = err.getResponse();
      payload.error =
        typeof response === 'string'
          ? response
          : sanitizeForAudit(response as Record<string, unknown>);
    } else if (err) {
      payload.error =
        err instanceof Error ? err.message : 'Non-Error exception thrown';
    }
    const json = JSON.stringify(payload);
    if (json.length <= METADATA_MAX_JSON) {
      return payload;
    }
    return {
      query,
      body: '[omitted: audit metadata too large]',
      error: payload.error,
      _truncated: true,
      _originalLength: json.length,
    };
  }

  private async resolveActor(
    authorizationHeader?: string,
  ): Promise<{ sub?: string; email?: string }> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      return {};
    }
    const token = authorizationHeader.slice('Bearer '.length).trim();
    if (!token) {
      return {};
    }
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub?: string;
        email?: string;
      }>(token);
      return { sub: payload.sub, email: payload.email };
    } catch {
      return {};
    }
  }
}
