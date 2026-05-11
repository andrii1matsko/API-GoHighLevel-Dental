import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LeyrService } from './leyr.service';
import { CreateLeyrAppointmentDto } from './dto/create-appointment.dto';
import { CreateLeyrPatientDto } from './dto/create-patient.dto';

@ApiTags('Leyr (Opus Test)')
@Controller('leyr')
export class LeyrController {
  constructor(private readonly leyrService: LeyrService) {}

  @Get('emrs')
  @ApiOperation({ summary: 'Get supported Leyr EHR integrations' })
  getEmrs() {
    return this.leyrService.getEmrs();
  }

  @Get('care-units')
  @ApiOperation({ summary: 'Get available Opus care units' })
  @ApiQuery({ name: 'emr', required: false })
  getCareUnits(@Query('emr') emr?: string) {
    return this.leyrService.getCareUnits(emr);
  }

  @Get('patients')
  @ApiOperation({ summary: 'Find patients by search criteria' })
  @ApiQuery({ name: 'careUnitId', required: true })
  @ApiQuery({ name: 'firstName', required: false })
  @ApiQuery({ name: 'lastName', required: false })
  @ApiQuery({ name: 'emr', required: false })
  findPatients(
    @Query('careUnitId') careUnitId: string,
    @Query('firstName') firstName?: string,
    @Query('lastName') lastName?: string,
    @Query('emr') emr?: string,
  ) {
    return this.leyrService.findPatients(careUnitId, firstName, lastName, emr);
  }

  @Get('patients/:patientId')
  @ApiOperation({ summary: 'Get patient details by ID' })
  @ApiParam({ name: 'patientId', required: true })
  @ApiQuery({ name: 'careUnitId', required: true })
  @ApiQuery({ name: 'emr', required: false })
  getPatient(
    @Param('patientId') patientId: string,
    @Query('careUnitId') careUnitId: string,
    @Query('emr') emr?: string,
  ) {
    return this.leyrService.getPatient(careUnitId, patientId, emr);
  }

  @Get('healthcare-services')
  @ApiOperation({ summary: 'Get healthcare services' })
  @ApiQuery({ name: 'careUnitId', required: true })
  @ApiQuery({ name: 'emr', required: false })
  getHealthcareServices(
    @Query('careUnitId') careUnitId: string,
    @Query('emr') emr?: string,
  ) {
    return this.leyrService.getHealthcareServices(careUnitId, emr);
  }

  @Get('resources')
  @ApiOperation({ summary: 'Get Opus practitioners/resources' })
  @ApiQuery({ name: 'careUnitId', required: true })
  @ApiQuery({ name: 'emr', required: false })
  getResources(
    @Query('careUnitId') careUnitId: string,
    @Query('emr') emr?: string,
  ) {
    return this.leyrService.getResources(careUnitId, emr);
  }

  @Get('timeslots')
  @ApiOperation({ summary: 'Get available appointment timeslots' })
  @ApiQuery({ name: 'careUnitId', required: true })
  @ApiQuery({ name: 'resourceId', required: false })
  @ApiQuery({ name: 'healthcareServiceId', required: false })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  @ApiQuery({ name: 'emr', required: false })
  getTimeslots(
    @Query('careUnitId') careUnitId: string,
    @Query('resourceId') resourceId?: string,
    @Query('healthcareServiceId') healthcareServiceId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('emr') emr?: string,
  ) {
    return this.leyrService.getTimeslots(
      careUnitId,
      resourceId,
      healthcareServiceId,
      start,   
      end,
      emr,
    );
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Get appointments with optional filters' })
  @ApiQuery({ name: 'careUnitId', required: true })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  @ApiQuery({ name: 'emr', required: false })
  getAppointments(
    @Query('careUnitId') careUnitId: string,
    @Query('patientId') patientId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('emr') emr?: string,
  ) {
    return this.leyrService.getAppointments(
      careUnitId,
      patientId,
      start,
      end,
      emr,
    );
  }

  @Get('medical-notes')
  @ApiOperation({ summary: 'Get patient medical notes' })
  @ApiQuery({ name: 'careUnitId', required: true })
  @ApiQuery({ name: 'patientId', required: true })
  @ApiQuery({ name: 'emr', required: false })
  getMedicalNotes(
    @Query('careUnitId') careUnitId: string,
    @Query('patientId') patientId: string,
    @Query('emr') emr?: string,
  ) {
    return this.leyrService.getMedicalNotes(careUnitId, patientId, emr);
  }

  @Post('emrs/:emr/care-units/:careUnitId/patients')
  @ApiOperation({
    summary: 'Create or update patient in Leyr for a care unit',
    description:
      'Registers a new patient in the EMR. If an account with the provided identifier already exists, the existing account is updated.',
  })
  @ApiParam({ name: 'emr', required: true, example: 'opus' })
  @ApiParam({ name: 'careUnitId', required: true })
  createPatient(
    @Param('emr') emr: string,
    @Param('careUnitId') careUnitId: string,
    @Body() body: CreateLeyrPatientDto,
  ) {
    return this.leyrService.createPatient(careUnitId, body, emr);
  }

  @Post('emrs/:emr/care-units/:careUnitId/appointments')
  @ApiOperation({ summary: 'Create appointment in Leyr for a care unit' })
  @ApiParam({ name: 'emr', required: true, example: 'opus' })
  @ApiParam({ name: 'careUnitId', required: true })
  createAppointment(
    @Param('emr') emr: string,
    @Param('careUnitId') careUnitId: string,
    @Body() body: CreateLeyrAppointmentDto,
  ) {
    return this.leyrService.createAppointment(careUnitId, body, emr);
  }
}
