/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, jest} from '@jest/globals';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const authService = {
    signUp: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  } as unknown as AuthService;

  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(authService);
  });

  it('delegates signup to auth service', async () => {
    const dto = { email: 'a@mail.com', password: '12345678', name: 'A' };
    (authService.signUp as jest.Mock).mockResolvedValue({ id: 'u1' });

    await controller.signUp(dto);

    expect(authService.signUp).toHaveBeenCalledWith(dto);
  });

  it('delegates login to auth service', async () => {
    const dto = { email: 'a@mail.com', password: '12345678' };
    (authService.login as jest.Mock).mockResolvedValue({ accessToken: 'token' });
    const fakeReq = { headers: { 'user-agent': 'TestAgent' } } as any;

    await controller.login(dto, '127.0.0.1', fakeReq);

    expect(authService.login).toHaveBeenCalledWith(dto, '127.0.0.1', 'TestAgent');
  });

  it('delegates logout to auth service', async () => {
    (authService.logout as jest.Mock).mockResolvedValue({ message: 'ok' });
    const fakeReq = { headers: { 'user-agent': 'TestAgent' } } as any;

    await controller.logout('Bearer token', '127.0.0.1', fakeReq);

    expect(authService.logout).toHaveBeenCalledWith('Bearer token', '127.0.0.1', 'TestAgent');
  });
});
