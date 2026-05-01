import { CareUnitsController } from './care-units.controller';
import { MasterDataService } from './master-data.service';

describe('CareUnitsController', () => {
  const service = {
    createCareUnit: jest.fn(),
    listCareUnits: jest.fn(),
    getCareUnit: jest.fn(),
    updateCareUnit: jest.fn(),
    deleteCareUnit: jest.fn(),
  } as unknown as MasterDataService;

  let controller: CareUnitsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CareUnitsController(service);
  });

  it('delegates create', async () => {
    const body = { name: 'Care', address: { city: 'Sofia' } };
    await controller.create(body as any);
    expect(service.createCareUnit).toHaveBeenCalledWith(body);
  });

  it('delegates list', async () => {
    await controller.list();
    expect(service.listCareUnits).toHaveBeenCalled();
  });

  it('delegates get', async () => {
    await controller.get('id-1');
    expect(service.getCareUnit).toHaveBeenCalledWith('id-1');
  });

  it('delegates update', async () => {
    const body = { name: 'Updated' };
    await controller.update('id-1', body as any);
    expect(service.updateCareUnit).toHaveBeenCalledWith('id-1', body);
  });

  it('delegates delete', async () => {
    await controller.delete('id-1');
    expect(service.deleteCareUnit).toHaveBeenCalledWith('id-1');
  });
});
