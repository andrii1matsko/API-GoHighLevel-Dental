import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateCareUnitDto, UpdateCareUnitDto } from './dto/care-unit.dto';
import {
  CreateHealthServiceDto,
  UpdateHealthServiceDto,
} from './dto/health-service.dto';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  // CareUnit
  createCareUnit(dto: CreateCareUnitDto) {
    const data: Prisma.CareUnitCreateInput = {
      ...dto,
      address: dto.address as Prisma.InputJsonValue,
      phones: dto.phones ?? Prisma.JsonNull,
      emails: dto.emails ?? Prisma.JsonNull,
    };
    return this.prisma.careUnit.create({ data });
  }

  listCareUnits() {
    return this.prisma.careUnit.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCareUnit(id: string) {
    const item = await this.prisma.careUnit.findUnique({
      where: { id },
      include: {
        healthService: true,
        resources: true,
      },
    });
    if (!item) {
      throw new NotFoundException('CareUnit not found');
    }
    return item;
  }

  async updateCareUnit(id: string, dto: UpdateCareUnitDto) {
    await this.ensureCareUnitExists(id);
    const data: Prisma.CareUnitUpdateInput = {
      ...dto,
      address: dto.address as Prisma.InputJsonValue | undefined,
      phones: dto.phones === null ? Prisma.JsonNull : dto.phones,
      emails: dto.emails === null ? Prisma.JsonNull : dto.emails,
    };
    return this.prisma.careUnit.update({
      where: { id },
      data,
    });
  }

  async deleteCareUnit(id: string) {
    await this.ensureCareUnitExists(id);
    return this.prisma.careUnit.delete({
      where: { id },
    });
  }

  // HealthService
  createHealthService(data: CreateHealthServiceDto) {
    return this.prisma.healthService.create({ data });
  }

  listHealthServices() {
    return this.prisma.healthService.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getHealthService(id: string) {
    const item = await this.prisma.healthService.findUnique({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException('HealthService not found');
    }
    return item;
  }

  async updateHealthService(id: string, data: UpdateHealthServiceDto) {
    await this.ensureHealthServiceExists(id);
    return this.prisma.healthService.update({
      where: { id },
      data,
    });
  }

  async deleteHealthService(id: string) {
    await this.ensureHealthServiceExists(id);
    return this.prisma.healthService.delete({
      where: { id },
    });
  }

  // Resource
  createResource(dto: CreateResourceDto) {
    const data: Prisma.ResourceUncheckedCreateInput = {
      ...dto,
      emails: dto.emails ?? Prisma.JsonNull,
    };
    return this.prisma.resource.create({ data });
  }

  listResources() {
    return this.prisma.resource.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getResource(id: string) {
    const item = await this.prisma.resource.findUnique({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException('Resource not found');
    }
    return item;
  }

  async updateResource(id: string, dto: UpdateResourceDto) {
    await this.ensureResourceExists(id);
    const data: Prisma.ResourceUncheckedUpdateInput = {
      ...dto,
      emails: dto.emails === null ? Prisma.JsonNull : dto.emails,
    };
    return this.prisma.resource.update({
      where: { id },
      data,
    });
  }

  async deleteResource(id: string) {
    await this.ensureResourceExists(id);
    return this.prisma.resource.delete({
      where: { id },
    });
  }

  private async ensureCareUnitExists(id: string) {
    const exists = await this.prisma.careUnit.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('CareUnit not found');
    }
  }

  private async ensureHealthServiceExists(id: string) {
    const exists = await this.prisma.healthService.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('HealthService not found');
    }
  }

  private async ensureResourceExists(id: string) {
    const exists = await this.prisma.resource.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Resource not found');
    }
  }
}
