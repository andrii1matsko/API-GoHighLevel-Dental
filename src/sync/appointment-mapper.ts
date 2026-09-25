import { GhlAppointment, LeyrAppointment } from '@prisma/client';
import { CreateLeyrAppointmentDto } from '../integrations/leyr/dto/create-appointment.dto';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from '../integrations/gohighlevel/dto/calendars.dto';
import { LeyrTarget } from './service-mapping-resolver.service';
import { GhlTarget } from './service-mapping-resolver.service';
import { ghlStatusToLeyr, leyrStatusToGhl } from './status-mapper';

/**
 * Clinic wall-clock timezone for Leyr EHR payloads.
 * Muntra treated `…Z` as local time (9:00 Stockholm → 7:00 in UI).
 */
export function clinicTimezoneForEmr(emr: string): string {
  return emr.trim().toLowerCase() === 'opus'
    ? 'Europe/Oslo'
    : 'Europe/Stockholm';
}

/**
 * Format an instant as ISO-8601 *with numeric offset* in the clinic zone
 * (e.g. 2026-10-08T09:00:00+02:00), not UTC `Z`.
 */
export function formatLeyrDateTime(date: Date, emr: string): string {
  const timeZone = clinicTimezoneForEmr(emr);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date for Leyr payload');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '00';

  const y = get('year');
  const mo = get('month');
  const d = get('day');
  const h = get('hour');
  const mi = get('minute');
  const s = get('second');

  // Offset = wall-clock-as-UTC − actual instant
  const asUtcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  const offsetMin = Math.round((asUtcMs - date.getTime()) / 60_000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');

  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
}

// ---------------------------------------------------------------------------
// GHL → Leyr
// ---------------------------------------------------------------------------

export interface GhlToLeyrInput {
  ghlAppointment: GhlAppointment;
  leyrPatientId: string;
  leyrTarget: LeyrTarget;
}

/**
 * Build a Leyr CreateAppointment payload from a stored GHL appointment,
 * a resolved patient ID, and resolved service/resource/care-unit targets.
 */
export function mapGhlToLeyrPayload(input: GhlToLeyrInput): {
  careUnitId: string;
  emr: string;
  payload: CreateLeyrAppointmentDto;
} {
  const { ghlAppointment, leyrPatientId, leyrTarget } = input;

  if (!ghlAppointment.startAt || !ghlAppointment.endAt) {
    throw new Error(
      `GHL appointment ${ghlAppointment.ghlAppointmentId} missing start/end time`,
    );
  }

  const payload: CreateLeyrAppointmentDto = {
    start: formatLeyrDateTime(ghlAppointment.startAt, leyrTarget.emr),
    end: formatLeyrDateTime(ghlAppointment.endAt, leyrTarget.emr),
    healthcare_service_id: leyrTarget.healthcareServiceId,
    resource_id: leyrTarget.resourceId,
    patient_id: leyrPatientId,
    comment: buildLeyrComment(
      ghlAppointment.title,
      ghlAppointment.ghlAppointmentId,
    ),
  };

  // URL path already scopes the clinic. Sending care_unit_id in the body
  // breaks some EHRs (Opus ClinicID mismatch; Muntra can reject patient_id).
  return {
    careUnitId: leyrTarget.careUnitId,
    emr: leyrTarget.emr,
    payload,
  };
}

function buildLeyrComment(title: string | null, fallbackId: string): string {
  if (title && title.trim().length > 0) return title.trim();
  return `Synced from GHL ${fallbackId}`;
}

// ---------------------------------------------------------------------------
// Leyr → GHL
// ---------------------------------------------------------------------------

export interface LeyrToGhlInput {
  leyrAppointment: LeyrAppointment;
  ghlContactId: string;
  ghlLocationId: string;
  ghlTarget: GhlTarget;
  sourceExternalId: string;
}

/**
 * Build a GHL CreateAppointment payload from a stored Leyr appointment,
 * a resolved contact ID, and resolved calendar/location targets.
 */
export function mapLeyrToGhlPayload(
  input: LeyrToGhlInput,
): CreateAppointmentDto {
  const {
    leyrAppointment,
    ghlContactId,
    ghlLocationId,
    ghlTarget,
    sourceExternalId,
  } = input;

  return {
    contactId: ghlContactId,
    locationId: ghlTarget.locationId || ghlLocationId,
    calendarId: ghlTarget.calendarId,
    startTime: leyrAppointment.startAt.toISOString(),
    endTime: leyrAppointment.endAt.toISOString(),
    title:
      leyrAppointment.description ??
      leyrAppointment.comment ??
      `Synced from EHR ${sourceExternalId}`,
    description: leyrAppointment.comment ?? undefined,
    appointmentStatus: leyrStatusToGhl(leyrAppointment.status),
    assignedUserId: ghlTarget.assignedUserId,
    ignoreFreeSlotValidation: true,
    toNotify: false,
    ignoreDateRange: true,
  };
}

// ---------------------------------------------------------------------------
// GHL Update → Leyr (cancel + recreate since Leyr has no PATCH endpoint)
// ---------------------------------------------------------------------------

/**
 * Leyr doesn't expose an update-appointment endpoint, so updating means
 * cancel the old one (if possible) and create a fresh replacement.
 * This function builds the new create payload from the updated GHL data.
 *
 * Returns null if the appointment is unchanged enough to skip recreation.
 */
export function mapGhlUpdateToLeyrCreatePayload(input: GhlToLeyrInput): {
  careUnitId: string;
  emr: string;
  payload: CreateLeyrAppointmentDto;
} {
  return mapGhlToLeyrPayload(input);
}

// ---------------------------------------------------------------------------
// Leyr → GHL Update
// ---------------------------------------------------------------------------

export interface LeyrToGhlUpdateInput {
  leyrAppointment: LeyrAppointment;
  ghlTarget: GhlTarget;
}

/**
 * Build a GHL UpdateAppointment payload from updated Leyr appointment data.
 * Only includes fields that GHL's PUT endpoint accepts.
 */
export function mapLeyrToGhlUpdatePayload(
  input: LeyrToGhlUpdateInput,
): UpdateAppointmentDto {
  const { leyrAppointment, ghlTarget } = input;

  return {
    startTime: leyrAppointment.startAt.toISOString(),
    endTime: leyrAppointment.endAt.toISOString(),
    title:
      leyrAppointment.description ??
      leyrAppointment.comment ??
      'Updated from EHR',
    description: leyrAppointment.comment ?? undefined,
    appointmentStatus: leyrStatusToGhl(leyrAppointment.status),
    assignedUserId: ghlTarget.assignedUserId,
    calendarId: ghlTarget.calendarId || undefined,
    locationId: ghlTarget.locationId || undefined,
    toNotify: false,
  };
}

// ---------------------------------------------------------------------------
// GHL → Leyr Status-only update (used for cancel/status changes)
// ---------------------------------------------------------------------------

export function mapGhlStatusToLeyr(
  ghlStatus: string | null | undefined,
): string {
  return ghlStatusToLeyr(ghlStatus);
}
