import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    session: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'JWT_ACCESS_TOKEN_EXPIRES_IN') return '3600';
      return undefined;
    });
    service = new AuthService(prisma, jwtService, configService);
  });

  it('signs up user with lowercase email and hashed password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'u1' });

    await service.signUp({
      email: 'USER@MAIL.COM',
      password: '12345678',
      name: 'User',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@mail.com' },
      select: { id: true },
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'user@mail.com',
          passwordHash: 'hashed',
        }),
      }),
    );
  });

  it('throws on duplicate email during signup', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

    await expect(
      service.signUp({
        email: 'test@mail.com',
        password: '12345678',
        name: 'User',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('logs in and creates session + jwt', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'user@mail.com',
      name: 'User',
      passwordHash: 'hashed',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (jwtService.signAsync as jest.Mock).mockResolvedValue('jwt-token');

    const result = await service.login({
      email: 'USER@MAIL.COM',
      password: '12345678',
    });

    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'u1',
        email: 'user@mail.com',
      }),
      expect.objectContaining({
        secret: 'test-secret',
        expiresIn: 3600,
      }),
    );
    expect(result.accessToken).toBe('jwt-token');
    expect(result.tokenType).toBe('Bearer');
  });

  it('throws unauthorized on invalid password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'user@mail.com',
      name: 'User',
      passwordHash: 'hashed',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({
        email: 'user@mail.com',
        password: 'wrong',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws on logout with invalid auth header', async () => {
    await expect(service.logout(undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.logout('Token abc')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('revokes session on valid logout token', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sid: 'sid-1' });

    const result = await service.logout('Bearer valid-token');

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token', {
      secret: 'test-secret',
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { tokenId: 'sid-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result).toEqual({ message: 'Logged out successfully' });
  });
});
