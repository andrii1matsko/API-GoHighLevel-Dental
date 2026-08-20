import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { GohighlevelController } from './gohighlevel.controller';
import { GohighlevelService } from './gohighlevel.service';
import { CalendarSyncService } from '../../sync/calendar-sync.service';

describe('GohighlevelController webhook immediate sync', () => {
  let controller: GohighlevelController;
  let gohighlevelService: {
    ingestAppointmentCreateWebhook: jest.Mock;
    ingestAppointmentMutationWebhook: jest.Mock;
  };
  let calendarSyncService: { syncAppointments: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    gohighlevelService = {
      ingestAppointmentCreateWebhook: jest.fn(),
      ingestAppointmentMutationWebhook: jest.fn(),
    };
    calendarSyncService = {
      syncAppointments: jest.fn().mockResolvedValue({
        trigger: 'webhook',
        pendingFound: 1,
        syncedCount: 1,
        failedCount: 0,
      }),
    };
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'SYNC_IMMEDIATE_ON_WEBHOOK') {
          return 'true';
        }
        return defaultValue;
      }),
    };

    controller = new GohighlevelController(
      gohighlevelService as unknown as GohighlevelService,
      calendarSyncService as unknown as CalendarSyncService,
      configService as unknown as ConfigService,
    );
  });

  it('triggers sync after create webhook when sync is queued', async () => {
    gohighlevelService.ingestAppointmentCreateWebhook.mockResolvedValue({
      accepted: true,
      appointmentId: 'appt-1',
      queuedSync: true,
    });

    const result = await controller.appointmentCreateWebhook({
      locationId: 'loc-1',
      appointment: {
        id: 'appt-1',
        calendarId: 'cal-1',
        contactId: 'contact-1',
        startTime: '2026-08-29T08:00:00.000Z',
        endTime: '2026-08-29T08:45:00.000Z',
      },
    });

    expect(result.accepted).toBe(true);
    expect(calendarSyncService.syncAppointments).toHaveBeenCalledWith(
      'webhook',
    );
  });

  it('does not trigger sync when webhook type mismatch rejects payload', async () => {
    const result = await controller.appointmentDeleteWebhook({
      type: 'AppointmentUpdate',
      locationId: 'loc-1',
      appointment: { id: 'appt-1' },
    });

    expect(result).toEqual({
      accepted: false,
      reason: 'Wrong webhook type for endpoint',
    });
    expect(calendarSyncService.syncAppointments).not.toHaveBeenCalled();
  });

  it('skips immediate sync when SYNC_IMMEDIATE_ON_WEBHOOK=false', async () => {
    configService.get.mockImplementation(
      (key: string, defaultValue?: string) => {
        if (key === 'SYNC_IMMEDIATE_ON_WEBHOOK') {
          return 'false';
        }
        return defaultValue;
      },
    );

    gohighlevelService.ingestAppointmentMutationWebhook.mockResolvedValue({
      accepted: true,
      appointmentId: 'appt-1',
      queuedSync: true,
    });

    await controller.appointmentUpdateWebhook({
      type: 'AppointmentUpdate',
      locationId: 'loc-1',
      appointment: { id: 'appt-1' },
    });

    expect(calendarSyncService.syncAppointments).not.toHaveBeenCalled();
  });
});
