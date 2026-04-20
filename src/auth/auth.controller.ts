import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke current access token session' })
  logout(@Headers('authorization') authorizationHeader?: string) {
    return this.authService.logout(authorizationHeader);
  }
}
