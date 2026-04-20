import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MasterDataService } from './master-data.service';
import {
  CreateHealthServiceDto,
  UpdateHealthServiceDto,
} from './dto/health-service.dto';

@ApiTags('HealthServices')
@Controller('health-services')
export class HealthServicesController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Post()
  @ApiOperation({ summary: 'Create health service' })
  create(@Body() body: CreateHealthServiceDto) {
    return this.masterDataService.createHealthService(body);
  }

  @Get()
  @ApiOperation({ summary: 'List health services' })
  list() {
    return this.masterDataService.listHealthServices();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get health service by id' })
  get(@Param('id') id: string) {
    return this.masterDataService.getHealthService(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update health service' })
  update(@Param('id') id: string, @Body() body: UpdateHealthServiceDto) {
    return this.masterDataService.updateHealthService(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete health service' })
  delete(@Param('id') id: string) {
    return this.masterDataService.deleteHealthService(id);
  }
}
