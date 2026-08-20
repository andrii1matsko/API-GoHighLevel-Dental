import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MasterDataService } from './master-data.service';
import { CreateCareUnitDto, UpdateCareUnitDto } from './dto/care-unit.dto';

@ApiTags('CareUnits')
@Controller('care-units')
export class CareUnitsController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Post()
  @ApiOperation({ summary: 'Create care unit' })
  create(@Body() body: CreateCareUnitDto) {
    return this.masterDataService.createCareUnit(body);
  }

  @Get()
  @ApiOperation({ summary: 'List care units' })
  list() {
    return this.masterDataService.listCareUnits();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get care unit by id' })
  get(@Param('id') id: string) {
    return this.masterDataService.getCareUnit(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update care unit' })
  update(@Param('id') id: string, @Body() body: UpdateCareUnitDto) {
    return this.masterDataService.updateCareUnit(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete care unit' })
  delete(@Param('id') id: string) {
    return this.masterDataService.deleteCareUnit(id);
  }
}
