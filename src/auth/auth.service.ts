import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/signup.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async signUp(dto: SignUpDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      await this.recordAuthAudit('login_failed', dto.email, null, ip, userAgent, 'User not found');
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      await this.recordAuthAudit('login_failed', dto.email, user.id, ip, userAgent, 'Wrong password');
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokenId = randomUUID();
    const expiresInSeconds = this.getAccessTokenExpirySeconds();
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenId,
        expiresAt,
      },
    });

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        sid: tokenId,
        email: user.email,
      },
      {
        secret: this.getJwtSecret(),
        expiresIn: expiresInSeconds,
      },
    );

    await this.recordAuthAudit('login_success', user.email, user.id, ip, userAgent);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async logout(authorizationHeader?: string, ip?: string, userAgent?: string) {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authorizationHeader.slice('Bearer '.length);
    let payload: { sid?: string; sub?: string; email?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.getJwtSecret(),
      });
    } catch {
      await this.recordAuthAudit('logout_failed', undefined, undefined, ip, userAgent, 'Invalid or expired token');
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (!payload.sid) {
      throw new UnauthorizedException('Invalid access token payload');
    }

    await this.prisma.session.updateMany({
      where: {
        tokenId: payload.sid,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await this.recordAuthAudit('logout_success', payload.email, payload.sub, ip, userAgent);

    return {
      message: 'Logged out successfully',
    };
  }

  private async recordAuthAudit(
    event: string,
    email?: string,
    userId?: string | null,
    ip?: string,
    userAgent?: string,
    reason?: string,
  ): Promise<void> {
    try {
      await this.auditLogService.record({
        actorUserId: userId ?? undefined,
        actorEmail: email,
        httpMethod: 'POST',
        path: `/api/auth/${event.split('_')[0]}`,
        resourceType: 'auth',
        resourceId: event,
        ip,
        userAgent,
        statusCode: event.includes('failed') ? 401 : 200,
        metadata: reason ? { reason } : undefined,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record auth audit: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private getJwtSecret() {
    return this.configService.get<string>('JWT_SECRET') ?? 'change-me-in-env';
  }

  private getAccessTokenExpirySeconds() {
    const raw = this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN');
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isNaN(parsed) ? 3600 : parsed;
  }
}
