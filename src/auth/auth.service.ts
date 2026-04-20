import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/signup.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
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

  async logout(authorizationHeader?: string) {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authorizationHeader.slice('Bearer '.length);
    let payload: { sid?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.getJwtSecret(),
      });
    } catch {
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

    return {
      message: 'Logged out successfully',
    };
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
