import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  const createHost = (
    req: Record<string, unknown>,
    res: Record<string, unknown>,
  ) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    }) as any;

  it('maps Prisma P2002 to 409', () => {
    const filter = new AllExceptionsFilter(config);
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const req = {
      method: 'POST',
      originalUrl: '/api/resources',
      url: '/api/resources',
      correlationId: 'rid',
    };
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    filter.catch(err, createHost(req, res));
    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        requestId: 'rid',
      }),
    );
  });

  it('maps HttpException to its status', () => {
    const filter = new AllExceptionsFilter(config);
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const req = {
      method: 'GET',
      originalUrl: '/api/x',
      url: '/api/x',
      correlationId: 'r2',
    };
    filter.catch(new BadRequestException('bad'), createHost(req, res));
    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'bad',
      }),
    );
  });
});
