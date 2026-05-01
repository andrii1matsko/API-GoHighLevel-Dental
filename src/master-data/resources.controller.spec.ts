import { ResourcesController } from './resources.controller';
import { MasterDataService } from './master-data.service';

describe('ResourcesController', () => {
  const service = {
    createResource: jest.fn(),
    listResources: jest.fn(),
    getResource: jest.fn(),
    updateResource: jest.fn(),
    deleteResource: jest.fn(),
  } as unknown as MasterDataService;

  let controller: ResourcesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ResourcesController(service);
  });

  it('delegates create', async () => {
    const body = { name: 'Dentist', careUnitId: 'c1' };
    await controller.create(body as any);
    expect(service.createResource).toHaveBeenCalledWith(body);
  });

  it('delegates list', async () => {
    await controller.list();
    expect(service.listResources).toHaveBeenCalled();
  });

  it('delegates get', async () => {
    await controller.get('id-1');
    expect(service.getResource).toHaveBeenCalledWith('id-1');
  });

  it('delegates update', async () => {
    const body = { name: 'Updated' };
    await controller.update('id-1', body as any);
    expect(service.updateResource).toHaveBeenCalledWith('id-1', body);
  });

  it('delegates delete', async () => {
    await controller.delete('id-1');
    expect(service.deleteResource).toHaveBeenCalledWith('id-1');
  });
});
