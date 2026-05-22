import { GhlAppointment, LeyrAppointment } from '@prisma/client';
import { CreateLeyrAppointmentDto } from '../integrations/leyr/dto/create-appointment.dto';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from '../integrations/gohighlevel/dto/calendars.dto';
import { LeyrTarget } from './service-mapping-resolver.service';
import { GhlTarget } from './service-mapping-resolver.service';
import { ghlStatusToLeyr, leyrStatusToGhl } from './status-mapper';

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

  return {
    careUnitId: leyrTarget.careUnitId,
    emr: leyrTarget.emr,
    payload: {
      start: ghlAppointment.startAt.toISOString(),
      end: ghlAppointment.endAt.toISOString(),
      healthcare_service_id: leyrTarget.healthcareServiceId,
      resource_id: leyrTarget.resourceId,
      patient_id: leyrPatientId,
      care_unit_id: leyrTarget.careUnitId,
      comment: buildLeyrComment(
        ghlAppointment.title,
        ghlAppointment.ghlAppointmentId,
      ),
    },
  };
}

function buildLeyrComment(
  title: string | null,
  fallbackId: string,
): string {
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
export function mapGhlUpdateToLeyrCreatePayload(
  input: GhlToLeyrInput,
): { careUnitId: string; emr: string; payload: CreateLeyrAppointmentDto } {
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
