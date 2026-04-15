import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok status payload', () => {
    const controller = new HealthController();
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('Opus Dental API');
  });
});
