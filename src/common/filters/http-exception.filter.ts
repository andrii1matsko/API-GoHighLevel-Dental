import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { RequestWithContext } from '../types/request-with-context';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();

    const { status, message, code } = this.normalizeException(exception);
    const isProd =
      this.configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';

    const body: Record<string, unknown> = {
      statusCode: status,
      message,
      path: request.originalUrl ?? request.url,
      requestId: request.correlationId,
      timestamp: new Date().toISOString(),
    };

    if (code) {
      body.code = code;
    }

    if (!isProd && exception instanceof Error && exception.stack) {
      body.stack = exception.stack;
    }

    this.logException(request, status, exception);

    if (!response.headersSent) {
      response.status(status).json(body);
    }
  }

  private normalizeException(exception: unknown): {
    status: number;
    message: string | string[];
    code?: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { status, message: res };
      }
      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        const msg = obj.message;
        return {
          status,
          message: Array.isArray(msg)
            ? (msg as string[])
            : typeof msg === 'string'
              ? msg
              : exception.message,
        };
      }
      return { status, message: exception.message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with this unique field already exists',
          code: exception.code,
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          code: exception.code,
        };
      }
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Database request failed',
        code: exception.code,
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid data for database operation',
        code: 'PRISMA_VALIDATION',
      };
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private logException(
    request: RequestWithContext,
    status: number,
    exception: unknown,
  ): void {
    const base = {
      requestId: request.correlationId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      status,
    };

    if (process.env.LOG_FORMAT === 'json') {
      const line = JSON.stringify({
        level: status >= 500 ? 'error' : 'warn',
        ts: new Date().toISOString(),
        ...base,
        error:
          exception instanceof Error
            ? { name: exception.name, message: exception.message }
            : String(exception),
      });
      if (status >= 500) {
        this.logger.error(line);
      } else {
        this.logger.warn(line);
      }
      return;
    }

    const msg = `[${base.requestId ?? 'no-id'}] ${base.method} ${base.path} -> ${base.status}`;
    if (exception instanceof Error) {
      if (status >= 500) {
        this.logger.error(msg, exception.stack);
      } else {
        this.logger.warn(`${msg} ${exception.message}`);
      }
      return;
    }

    this.logger.warn(`${msg} ${String(exception)}`);
  }
}
