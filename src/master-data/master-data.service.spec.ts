import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MasterDataService } from './master-data.service';

describe('MasterDataService', () => {
  const prisma = {
    careUnit: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    healthService: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    resource: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;

  let service: MasterDataService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MasterDataService(prisma);
  });

  it('creates care unit with json null defaults', async () => {
    (prisma.careUnit.create as jest.Mock).mockResolvedValue({ id: 'c1' });
    const dto = { name: 'Care Unit', address: { city: 'Sofia' } };

    await service.createCareUnit(dto as any);

    expect(prisma.careUnit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        address: { city: 'Sofia' },
        phones: Prisma.JsonNull,
        emails: Prisma.JsonNull,
      }),
    });
  });

  it('throws when care unit does not exist', async () => {
    (prisma.careUnit.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.getCareUnit('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates care unit after existence check', async () => {
    (prisma.careUnit.findUnique as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.careUnit.update as jest.Mock).mockResolvedValue({ id: 'c1' });

    await service.updateCareUnit('c1', { emails: null } as any);

    expect(prisma.careUnit.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ emails: Prisma.JsonNull }),
    });
  });

  it('creates resource with json null emails by default', async () => {
    (prisma.resource.create as jest.Mock).mockResolvedValue({ id: 'r1' });

    await service.createResource({ name: 'Doctor', careUnitId: 'c1' } as any);

    expect(prisma.resource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ emails: Prisma.JsonNull }),
    });
  });

  it('throws when resource does not exist', async () => {
    (prisma.resource.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.getResource('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when health service does not exist', async () => {
    (prisma.healthService.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.getHealthService('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
