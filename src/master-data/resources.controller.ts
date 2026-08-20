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
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';

@ApiTags('Resources')
@Controller('resources')
export class ResourcesController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Post()
  @ApiOperation({ summary: 'Create resource' })
  create(@Body() body: CreateResourceDto) {
    return this.masterDataService.createResource(body);
  }

  @Get()
  @ApiOperation({ summary: 'List resources' })
  list() {
    return this.masterDataService.listResources();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get resource by id' })
  get(@Param('id') id: string) {
    return this.masterDataService.getResource(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update resource' })
  update(@Param('id') id: string, @Body() body: UpdateResourceDto) {
    return this.masterDataService.updateResource(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete resource' })
  delete(@Param('id') id: string) {
    return this.masterDataService.deleteResource(id);
  }
}
