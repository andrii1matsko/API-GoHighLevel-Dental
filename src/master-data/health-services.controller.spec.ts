import { HealthServicesController } from './health-services.controller';
import { MasterDataService } from './master-data.service';

describe('HealthServicesController', () => {
  const service = {
    createHealthService: jest.fn(),
    listHealthServices: jest.fn(),
    getHealthService: jest.fn(),
    updateHealthService: jest.fn(),
    deleteHealthService: jest.fn(),
  } as unknown as MasterDataService;

  let controller: HealthServicesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HealthServicesController(service);
  });

  it('delegates create', async () => {
    const body = { name: 'Consultation' };
    await controller.create(body as any);
    expect(service.createHealthService).toHaveBeenCalledWith(body);
  });

  it('delegates list', async () => {
    await controller.list();
    expect(service.listHealthServices).toHaveBeenCalled();
  });

  it('delegates get', async () => {
    await controller.get('id-1');
    expect(service.getHealthService).toHaveBeenCalledWith('id-1');
  });

  it('delegates update', async () => {
    const body = { name: 'Updated' };
    await controller.update('id-1', body as any);
    expect(service.updateHealthService).toHaveBeenCalledWith('id-1', body);
  });

  it('delegates delete', async () => {
    await controller.delete('id-1');
    expect(service.deleteHealthService).toHaveBeenCalledWith('id-1');
  });
});
