import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeyrAppointmentDto } from './dto/create-appointment.dto';
import { CreateLeyrPatientDto } from './dto/create-patient.dto';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

interface CreateLeyrAppointmentOptions {
  enqueueSync?: boolean;
}

const MOCK_CARE_UNITS = [
  {
    id: 'cu-stockholm-01',
    emr_id: 'opus-cu-001',
    name: 'Tandläkare Stockholm City',
    address: {
      street: 'Sveavägen 42',
      city: 'Stockholm',
      postalCode: '111 34',
      country: 'SE',
    },
    instance_id: 1,
    instance_name: 'Opus Dental SE',
    phones: ['+46 8 123 45 67'],
    emails: ['reception@tandlakare-stockholm.se'],
  },
  {
    id: 'cu-oslo-01',
    emr_id: 'opus-cu-002',
    name: 'Tannlege Oslo Sentrum',
    address: {
      street: 'Karl Johans gate 15',
      city: 'Oslo',
      postalCode: '0154',
      country: 'NO',
    },
    instance_id: 2,
    instance_name: 'Opus Dental NO',
    phones: ['+47 22 33 44 55'],
    emails: ['post@tannlege-oslo.no'],
  },
];

const MOCK_PATIENTS = [
  {
    id: 'pat-se-001',
    first_name: 'Erik',
    last_name: 'Johansson',
    date_of_birth: '1985-03-15',
    email: 'erik.johansson@example.se',
    phone: '+46 70 123 45 67',
    ssn: '198503151234',
    care_unit_id: 'cu-stockholm-01',
  },
  {
    id: 'pat-se-002',
    first_name: 'Anna',
    last_name: 'Lindström',
    date_of_birth: '1990-07-22',
    email: 'anna.lindstrom@example.se',
    phone: '+46 70 234 56 78',
    ssn: '199007225678',
    care_unit_id: 'cu-stockholm-01',
  },
  {
    id: 'pat-no-001',
    first_name: 'Lars',
    last_name: 'Hansen',
    date_of_birth: '1978-11-08',
    email: 'lars.hansen@example.no',
    phone: '+47 90 12 34 56',
    ssn: '08117812345',
    care_unit_id: 'cu-oslo-01',
  },
  {
    id: 'pat-no-002',
    first_name: 'Ingrid',
    last_name: 'Berg',
    date_of_birth: '1995-01-30',
    email: 'ingrid.berg@example.no',
    phone: '+47 91 23 45 67',
    ssn: '30019523456',
    care_unit_id: 'cu-oslo-01',
  },
];

const MOCK_HEALTHCARE_SERVICES = [
  {
    id: 'hs-001',
    emr_id: 'opus-hs-001',
    name: 'Undersökning / Examination',
    description: 'Comprehensive dental examination',
    price: 850,
    duration: 30,
    category: 'examination',
    care_unit_id: 'cu-stockholm-01',
  },
  {
    id: 'hs-002',
    emr_id: 'opus-hs-002',
    name: 'Tandrengöring / Cleaning',
    description: 'Professional dental cleaning',
    price: 1200,
    duration: 45,
    category: 'hygiene',
    care_unit_id: 'cu-stockholm-01',
  },
  {
    id: 'hs-003',
    emr_id: 'opus-hs-003',
    name: 'Fyllning / Filling',
    description: 'Composite filling',
    price: 1800,
    duration: 60,
    category: 'restorative',
    care_unit_id: 'cu-stockholm-01',
  },
  {
    id: 'hs-no-001',
    emr_id: 'opus-hs-no-001',
    name: 'Undersøkelse / Examination',
    description: 'Comprehensive dental examination',
    price: 950,
    duration: 30,
    category: 'examination',
    care_unit_id: 'cu-oslo-01',
  },
];

const MOCK_RESOURCES = [
  {
    id: 'res-001',
    emr_id: 'opus-res-001',
    type: 'practitioner',
    name: 'Dr. Sofia Andersson',
    first_name: 'Sofia',
    last_name: 'Andersson',
    emails: ['sofia.andersson@tandlakare-stockholm.se'],
    description: 'General Dentist',
    care_unit_id: 'cu-stockholm-01',
  },
  {
    id: 'res-002',
    emr_id: 'opus-res-002',
    type: 'practitioner',
    name: 'Dr. Magnus Ekström',
    first_name: 'Magnus',
    last_name: 'Ekström',
    emails: ['magnus.ekstrom@tandlakare-stockholm.se'],
    description: 'Orthodontist',
    care_unit_id: 'cu-stockholm-01',
  },
  {
    id: 'res-no-001',
    emr_id: 'opus-res-no-001',
    type: 'practitioner',
    name: 'Dr. Karin Olsen',
    first_name: 'Karin',
    last_name: 'Olsen',
    emails: ['karin.olsen@tannlege-oslo.no'],
    description: 'General Dentist',
    care_unit_id: 'cu-oslo-01',
  },
];

const MOCK_EMRS = [
  { id: 'opus', name: 'Opus Dental', country: 'SE' },
  { id: 'opus-no', name: 'Opus Dental Norway', country: 'NO' },
];

function generateTimeslots(
  careUnitId: string,
  resourceId?: string,
  startStr?: string,
  endStr?: string,
): Array<Record<string, unknown>> {
  const start = startStr ? new Date(startStr) : new Date();
  const end = endStr
    ? new Date(endStr)
    : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const isNorway = careUnitId.includes('oslo');
  const tz = isNorway ? 'Europe/Oslo' : 'Europe/Stockholm';
  const slots: Array<Record<string, unknown>> = [];
  const current = new Date(start);

  while (current < end && slots.length < 40) {
    const day = current.getDay();
    if (day >= 1 && day <= 5) {
      for (let hour = 8; hour < 16; hour++) {
        const slotStart = new Date(current);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

        if (slotStart >= start && slotEnd <= end) {
          slots.push({
            id: `ts-${randomUUID().slice(0, 8)}`,
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            timezone: tz,
            care_unit_id: careUnitId,
            resource_id:
              resourceId ??
              (isNorway ? 'res-no-001' : 'res-001'),
            available: true,
          });
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return slots;
}

const inMemoryAppointments: Array<Record<string, unknown>> = [];

@Injectable()
export class LeyrMockService {
  private readonly logger = new Logger(LeyrMockService.name);

  constructor(private readonly prismaService: PrismaService) {
    this.logger.log('Using MOCK Leyr service (USE_MOCK_INTEGRATIONS=true)');
  }

  getEmrs() {
    return Promise.resolve(MOCK_EMRS);
  }

  getCareUnits(_emr?: string) {
    return Promise.resolve(MOCK_CARE_UNITS);
  }

  findPatients(
    careUnitId: string,
    firstName?: string,
    lastName?: string,
    _emr?: string,
  ) {
    let results = MOCK_PATIENTS.filter((p) => p.care_unit_id === careUnitId);
    if (firstName) {
      results = results.filter((p) =>
        p.first_name.toLowerCase().includes(firstName.toLowerCase()),
      );
    }
    if (lastName) {
      results = results.filter((p) =>
        p.last_name.toLowerCase().includes(lastName.toLowerCase()),
      );
    }
    return Promise.resolve(results);
  }

  getPatient(careUnitId: string, patientId: string, _emr?: string) {
    const patient = MOCK_PATIENTS.find(
      (p) => p.id === patientId && p.care_unit_id === careUnitId,
    );
    if (!patient) {
      return Promise.resolve(null);
    }
    return Promise.resolve(patient);
  }

  getHealthcareServices(careUnitId: string, _emr?: string) {
    return Promise.resolve(
      MOCK_HEALTHCARE_SERVICES.filter((s) => s.care_unit_id === careUnitId),
    );
  }

  getResources(careUnitId: string, _emr?: string) {
    return Promise.resolve(
      MOCK_RESOURCES.filter((r) => r.care_unit_id === careUnitId),
    );
  }

  getTimeslots(
    careUnitId: string,
    resourceId?: string,
    _healthcareServiceId?: string,
    start?: string,
    end?: string,
    _emr?: string,
  ) {
    return Promise.resolve(
      generateTimeslots(careUnitId, resourceId, start, end),
    );
  }

  getAppointments(
    careUnitId: string,
    patientId?: string,
    _start?: string,
    _end?: string,
    _emr?: string,
  ) {
    let results = inMemoryAppointments.filter(
      (a) => a.care_unit_id === careUnitId,
    );
    if (patientId) {
      results = results.filter((a) => a.patient_id === patientId);
    }
    return Promise.resolve(results);
  }

  getMedicalNotes(careUnitId: string, patientId: string, _emr?: string) {
    return Promise.resolve([
      {
        id: `note-${randomUUID().slice(0, 8)}`,
        care_unit_id: careUnitId,
        patient_id: patientId,
        date: new Date().toISOString(),
        content: 'Mock clinical note: Patient in good dental health.',
        author: 'Dr. Sofia Andersson',
      },
    ]);
  }

  createPatient(
    careUnitId: string,
    payload: CreateLeyrPatientDto,
    _emr?: string,
  ) {
    const patientId = `pat-mock-${randomUUID().slice(0, 12)}`;
    const patient: Record<string, unknown> = {
      id: patientId,
      emr_id: `opus-pat-${randomUUID().slice(0, 8)}`,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
      other_name: payload.other_name ?? null,
      birth_datetime: payload.birth_datetime ?? null,
      gender: payload.gender ?? null,
      addresses: payload.addresses ?? [],
      phones: payload.phones ?? [],
      emails: payload.emails ?? [],
      external_id: payload.external_id ?? null,
      languages: payload.languages ?? null,
      contacts: payload.contacts ?? [],
      title: payload.title ?? null,
      ethnicity: payload.ethnicity ?? null,
      protected_identity: null,
      care_unit_id: careUnitId,
      deceased: null,
    };

    MOCK_PATIENTS.push({
      id: patientId,
      first_name: payload.first_name ?? '',
      last_name: payload.last_name ?? '',
      date_of_birth: payload.birth_datetime ?? '',
      email: payload.emails?.[0] ?? '',
      phone: payload.phones?.[0] ?? '',
      ssn: payload.external_id ?? '',
      care_unit_id: careUnitId,
    });

    return Promise.resolve(patient);
  }

  async createAppointment(
    careUnitId: string,
    payload: CreateLeyrAppointmentDto,
    emr?: string,
    options: CreateLeyrAppointmentOptions = {},
  ) {
    const isNorway = careUnitId.includes('oslo');
    const tz = isNorway ? 'Europe/Oslo' : 'Europe/Stockholm';
    const appointmentId = `leyr-mock-${randomUUID().slice(0, 12)}`;

    const appointment: Record<string, unknown> = {
      id: appointmentId,
      emr_id: `opus-${randomUUID().slice(0, 8)}`,
      care_unit_id: careUnitId,
      patient_id: payload.patient_id,
      resource_id: payload.resource_id,
      healthcare_service_id: payload.healthcare_service_id,
      start: payload.start,
      end: payload.end,
      status: 'booked',
      description: null,
      comment: payload.comment ?? null,
      timezone: tz,
      participants: [
        {
          id: payload.resource_id,
          type: 'practitioner',
        },
      ],
      healthcare_services: [
        {
          id: payload.healthcare_service_id,
        },
      ],
    };

    inMemoryAppointments.push(appointment);

    const leyrAppointmentId = appointmentId;
    const parsedStart = new Date(payload.start);
    const parsedEnd = new Date(payload.end);

    const persisted = await this.prismaService.leyrAppointment.upsert({
      where: { leyrAppointmentId },
      create: {
        leyrAppointmentId,
        emr: emr ?? 'opus',
        emrId: appointment.emr_id as string,
        careUnitId,
        patientId: payload.patient_id,
        resourceId: payload.resource_id,
        healthcareServiceId: payload.healthcare_service_id,
        startAt: parsedStart,
        endAt: parsedEnd,
        status: 'booked',
        comment: payload.comment ?? null,
        participants: appointment.participants as Prisma.InputJsonValue,
        healthcareServices:
          appointment.healthcare_services as Prisma.InputJsonValue,
        rawPayload: appointment as Prisma.InputJsonValue,
      },
      update: {
        emr: emr ?? 'opus',
        careUnitId,
        patientId: payload.patient_id,
        resourceId: payload.resource_id,
        healthcareServiceId: payload.healthcare_service_id,
        startAt: parsedStart,
        endAt: parsedEnd,
        status: 'booked',
        comment: payload.comment ?? null,
        rawPayload: appointment as Prisma.InputJsonValue,
      },
    });

    if (options.enqueueSync ?? true) {
      const idempotencyKey = `LEYR_TO_GHL:${leyrAppointmentId}`;
      await this.prismaService.appointmentSync.upsert({
        where: { idempotencyKey },
        create: {
          idempotencyKey,
          direction: 'LEYR_TO_GHL',
          status: 'pending',
          sourceSystem: 'LEYR',
          sourceExternalId: leyrAppointmentId,
          targetSystem: 'GHL',
          leyrAppointmentId: persisted.id,
        },
        update: {
          status: 'pending',
          errorMessage: null,
        },
      });
    }

    return [appointment];
  }
}
