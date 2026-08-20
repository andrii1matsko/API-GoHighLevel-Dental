import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Ip,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Create a new user account' })
  signUp(@Body() body: SignUpDto) {
    return this.authService.signUp(body);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate and get access token' })
  login(@Body() body: LoginDto, @Ip() ip: string, @Req() req: Request) {
    return this.authService.login(body, ip, req.headers['user-agent']);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke current access token session' })
  logout(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.logout(
      authorizationHeader,
      ip,
      req.headers['user-agent'],
    );
  }
}
