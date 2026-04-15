import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface LayerAppointment {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  patientName?: string;
}

@Injectable()
export class LayerApiService {
  private readonly logger = new Logger(LayerApiService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('LAYER_API_BASE_URL', '');
    this.apiKey = this.configService.get<string>('LAYER_API_KEY', '');
  }

  async getUpcomingAppointments(): Promise<LayerAppointment[]> {
    if (!this.baseUrl || !this.apiKey) {
      this.logger.warn(
        'Layer API credentials are missing, returning empty appointment list',
      );
      return [];
    }

    const url = `${this.baseUrl}/appointments/upcoming`;
    const response = await firstValueFrom(
      this.httpService.get<LayerAppointment[]>(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }),
    );

    return response.data ?? [];
  }
}
