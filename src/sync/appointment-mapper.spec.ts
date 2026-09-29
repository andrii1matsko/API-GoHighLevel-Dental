import { GhlAppointment, LeyrAppointment } from '@prisma/client';
import {
  buildLeyrComment,
  LEYR_LEADCOM_COMMENT_TAG,
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

  it('formats Muntra start/end with Stockholm offset (not UTC Z)', () => {
    // 07:00Z = 09:00 Europe/Stockholm in CEST (Oct)
    const mapped = mapGhlToLeyrPayload({
      ghlAppointment: fakeGhlAppointment({
        startAt: new Date('2026-10-08T07:00:00.000Z'),
        endAt: new Date('2026-10-08T07:40:00.000Z'),
      }),
      leyrPatientId: 'leyr-patient-1',
      leyrTarget: {
        careUnitId: 'L925_6509',
        emr: 'muntra',
        healthcareServiceId: '359',
        resourceId: '2287',
      },
    });

    expect(mapped.payload.start).toBe('2026-10-08T09:00:00+02:00');
    expect(mapped.payload.end).toBe('2026-10-08T09:40:00+02:00');
  });

  it('appends (Leadcom) to comment from GHL title', () => {
    const mapped = mapGhlToLeyrPayload({
      ghlAppointment: fakeGhlAppointment({ title: 'Undersøkelse' }),
      leyrPatientId: 'leyr-patient-1',
      leyrTarget: {
        careUnitId: 'L971_472',
        emr: 'opus',
        healthcareServiceId: '7277',
        resourceId: '6601',
      },
    });

    expect(mapped.payload.comment).toBe(
      `Undersøkelse ${LEYR_LEADCOM_COMMENT_TAG}`,
    );
  });

  it('does not duplicate (Leadcom) if title already has it', () => {
    const mapped = mapGhlToLeyrPayload({
      ghlAppointment: fakeGhlAppointment({
        title: `Exam ${LEYR_LEADCOM_COMMENT_TAG}`,
      }),
      leyrPatientId: 'leyr-patient-1',
      leyrTarget: {
        careUnitId: 'L971_472',
        emr: 'opus',
        healthcareServiceId: '7277',
        resourceId: '6601',
      },
    });

    expect(mapped.payload.comment).toBe(`Exam ${LEYR_LEADCOM_COMMENT_TAG}`);
  });
});

describe('buildLeyrComment', () => {
  it('falls back to Synced from GHL id with Leadcom tag', () => {
    expect(buildLeyrComment(null, 'ghl-1')).toBe(
      `Synced from GHL ghl-1 ${LEYR_LEADCOM_COMMENT_TAG}`,
    );
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
