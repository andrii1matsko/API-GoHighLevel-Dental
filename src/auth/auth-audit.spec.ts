import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService – Audit logging', () => {
  let service: AuthService;
  let auditLogService: jest.Mocked<AuditLogService>;
  let prisma: any;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$2b$10$hashvalue',
    name: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      session: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
      isEnabled: jest.fn().mockReturnValue(true),
    } as any;

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
      verifyAsync: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'JWT_SECRET') return 'test-secret';
              if (key === 'JWT_ACCESS_TOKEN_EXPIRES_IN') return '3600';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('login audit logging', () => {
    it('logs login_failed when user not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login(
          { email: 'unknown@test.com', password: 'pass' },
          '127.0.0.1',
          'TestAgent/1.0',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorEmail: 'unknown@test.com',
          actorUserId: undefined,
          resourceId: 'login_failed',
          resourceType: 'auth',
          ip: '127.0.0.1',
          userAgent: 'TestAgent/1.0',
          statusCode: 401,
          metadata: { reason: 'User not found' },
        }),
      );
    });

    it('logs login_failed when password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.login(
          { email: mockUser.email, password: 'wrongpass' },
          '192.168.1.1',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          actorEmail: mockUser.email,
          resourceId: 'login_failed',
          metadata: { reason: 'Wrong password' },
        }),
      );
    });

    it('logs login_success on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      prisma.session.create.mockResolvedValueOnce({});

      const result = await service.login(
        { email: mockUser.email, password: 'correct' },
        '10.0.0.1',
        'Mozilla/5.0',
      );

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          actorEmail: mockUser.email,
          resourceId: 'login_success',
          resourceType: 'auth',
          ip: '10.0.0.1',
          userAgent: 'Mozilla/5.0',
          statusCode: 200,
        }),
      );
    });
  });

  describe('logout audit logging', () => {
    it('logs logout_failed when token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValueOnce(new Error('Invalid token'));

      await expect(
        service.logout('Bearer bad-token', '127.0.0.1', 'TestAgent'),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: 'logout_failed',
          statusCode: 401,
          metadata: { reason: 'Invalid or expired token' },
        }),
      );
    });

    it('logs logout_success on valid logout', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({
        sub: 'user-1',
        sid: 'session-1',
        email: 'test@example.com',
      });
      prisma.session.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.logout(
        'Bearer valid-token',
        '10.0.0.1',
        'Chrome',
      );

      expect(result.message).toBe('Logged out successfully');
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          actorEmail: 'test@example.com',
          resourceId: 'logout_success',
          statusCode: 200,
        }),
      );
    });
  });

  describe('audit logging resilience', () => {
    it('does not throw when audit logging fails', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      auditLogService.record.mockRejectedValueOnce(new Error('DB down'));

      await expect(
        service.login(
          { email: 'user@test.com', password: 'pass' },
          '127.0.0.1',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
