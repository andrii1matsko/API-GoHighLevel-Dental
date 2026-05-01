/* eslint-disable @typescript-eslint/unbound-method */
import { jest, type Mock } from '@jest/globals';
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

    await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(dto);
  });

  it('delegates logout to auth service', async () => {
    (authService.logout as jest.Mock).mockResolvedValue({ message: 'ok' });

    await controller.logout('Bearer token');

    expect(authService.logout).toHaveBeenCalledWith('Bearer token');
  });
});
