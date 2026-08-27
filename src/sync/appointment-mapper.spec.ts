import { GhlAppointment, LeyrAppointment } from '@prisma/client';
import {
  mapGhlToLeyrPayload,
  mapLeyrToGhlUpdatePayload,
} from './appointment-mapper';

function fakeGhlAppointment(
  overrides: Partial<GhlAppointment> = {},
): GhlAppointment {
  return {
    id: 'db-id',
    ghlAppointmentId: 'ghl-appt-1',
    locationId: 'loc-1',
    calendarId: 'cal-1',
    contactId: 'contact-1',
    assignedUserId: 'user-1',
    startAt: new Date('2026-08-28T08:00:00.000Z'),
    endAt: new Date('2026-08-28T08:45:00.000Z'),
    title: 'Test Sync',
    status: 'confirmed',
    meetingLocationType: null,
    address: null,
    isRecurring: null,
    rrule: null,
    rawPayload: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('mapGhlToLeyrPayload', () => {
  it('omits care_unit_id for Opus EMR', () => {
    const mapped = mapGhlToLeyrPayload({
      ghlAppointment: fakeGhlAppointment(),
      leyrPatientId: 'leyr-patient-1',
      leyrTarget: {
        careUnitId: 'L902_470-2aecdad9-06ba-42d5-af5f6d434f309',
        emr: 'opus',
        healthcareServiceId: '26105',
        resourceId: '1000',
      },
    });

    expect(mapped.careUnitId).toBe('L902_470-2aecdad9-06ba-42d5-af5f6d434f309');
    expect(mapped.payload.care_unit_id).toBeUndefined();
    expect(mapped.payload.healthcare_service_id).toBe('26105');
  });

  it('omits care_unit_id for non-Opus EMRs too (path already scopes clinic)', () => {
    const mapped = mapGhlToLeyrPayload({
      ghlAppointment: fakeGhlAppointment(),
      leyrPatientId: 'leyr-patient-1',
      leyrTarget: {
        careUnitId: 'cu-stockholm-01',
        emr: 'muntra',
        healthcareServiceId: 'hs-1',
        resourceId: 'res-1',
      },
    });

    expect(mapped.careUnitId).toBe('cu-stockholm-01');
    expect(mapped.payload.care_unit_id).toBeUndefined();
  });
});

describe('mapLeyrToGhlUpdatePayload', () => {
  it('includes locationId from ghlTarget for multi-location token selection', () => {
    const leyrAppointment = {
      startAt: new Date('2026-09-09T15:00:00.000Z'),
      endAt: new Date('2026-09-09T15:45:00.000Z'),
      description: 'Exam',
      comment: null,
      status: 'booked',
    } as LeyrAppointment;

    const payload = mapLeyrToGhlUpdatePayload({
      leyrAppointment,
      ghlTarget: {
        calendarId: 'cal-1',
        groupId: 'group-1',
        locationId: 'loc-muntra',
        assignedUserId: 'user-1',
      },
    });

    expect(payload.locationId).toBe('loc-muntra');
    expect(payload.calendarId).toBe('cal-1');
  });
});
