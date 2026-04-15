import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LayerAppointment } from '../layer/layer-api.service';

@Injectable()
export class GohighlevelService {
  private readonly logger = new Logger(GohighlevelService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly locationId: string;
  private readonly calendarId: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'GHL_API_BASE_URL',
      'https://services.leadconnectorhq.com',
    );
    this.apiKey = this.configService.get<string>('GHL_API_KEY', '');
    this.locationId = this.configService.get<string>('GHL_LOCATION_ID', '');
    this.calendarId = this.configService.get<string>('GHL_CALENDAR_ID', '');
  }

  async upsertAppointment(appointment: LayerAppointment): Promise<void> {
    if (!this.apiKey || !this.locationId || !this.calendarId) {
      this.logger.warn(
        `Skipping appointment ${appointment.id}: missing GoHighLevel credentials`,
      );
      return;
    }

    const payload = {
      title: appointment.title,
      calendarId: this.calendarId,
      locationId: this.locationId,
      startTime: appointment.startAt,
      endTime: appointment.endAt,
      appointmentStatus: 'confirmed',
      notes: appointment.patientName
        ? `Patient: ${appointment.patientName}`
        : undefined,
      source: 'opus-dental-layer-sync',
      externalId: appointment.id,
    };

    await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/calendars/events`, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Version: '2021-04-15',
        },
      }),
    );
  }
}
