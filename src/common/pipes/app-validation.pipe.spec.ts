import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { AppValidationPipe } from './app-validation.pipe';
import { GhlAppointmentCreateWebhookDto } from '../../integrations/gohighlevel/dto/webhook-appointment-create.dto';

class StrictOnlyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

describe('AppValidationPipe', () => {
  const pipe = new AppValidationPipe();

  it('accepts undocumented GHL webhook fields such as timestamp', async () => {
    const payload = {
      type: 'AppointmentCreate',
      locationId: '3hVPjaJpMLtF29L0zaBX',
      timestamp: '2026-08-20T08:27:41Z',
      id: '679b8f9bde6a0c356a0311b3',
      appointment: {
        id: 'appt-1',
        calendarId: '1Wji81CmUx0VmDAYSeAD',
        contactId: 'contact-1',
        startTime: '2026-08-28T00:00:00+02:00',
        endTime: '2026-08-28T00:30:00+02:00',
        timezone: 'Europe/Oslo',
      },
    };

    const result = await pipe.transform(payload, {
      type: 'body',
      metatype: GhlAppointmentCreateWebhookDto,
    });

    expect(result).toMatchObject({
      type: 'AppointmentCreate',
      locationId: '3hVPjaJpMLtF29L0zaBX',
      timestamp: '2026-08-20T08:27:41Z',
      appointment: {
        id: 'appt-1',
        calendarId: '1Wji81CmUx0VmDAYSeAD',
        contactId: 'contact-1',
      },
    });
    expect(
      (result as GhlAppointmentCreateWebhookDto).appointment.timezone,
    ).toBe('Europe/Oslo');
  });

  it('still rejects unknown fields on non-webhook DTOs', async () => {
    await expect(
      pipe.transform(
        { name: 'ok', extra: 'nope' },
        { type: 'body', metatype: StrictOnlyDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates required fields on webhook DTOs', async () => {
    await expect(
      pipe.transform(
        {
          type: 'AppointmentCreate',
          locationId: 'loc',
          appointment: {
            id: 'appt-1',
            calendarId: 'cal',
            startTime: 'not-a-date',
            endTime: '2026-08-28T00:30:00+02:00',
          },
        },
        { type: 'body', metatype: GhlAppointmentCreateWebhookDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('GhlAppointmentCreateWebhookDto whitelisted fields', () => {
  it('maps timestamp and id from plain payload', () => {
    const dto = plainToInstance(GhlAppointmentCreateWebhookDto, {
      type: 'AppointmentCreate',
      locationId: 'loc',
      timestamp: '2026-08-20T08:27:41Z',
      id: 'event-id',
      appointment: {
        id: 'appt',
        calendarId: 'cal',
        contactId: 'contact',
        startTime: '2026-08-28T00:00:00+02:00',
        endTime: '2026-08-28T00:30:00+02:00',
      },
    });

    expect(dto.timestamp).toBe('2026-08-20T08:27:41Z');
    expect(dto.id).toBe('event-id');
  });
});
