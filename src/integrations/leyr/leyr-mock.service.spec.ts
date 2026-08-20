import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { LeyrMockService } from './leyr-mock.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrismaStub() {
  return {
    leyrAppointment: {
      upsert: jest.fn().mockResolvedValue({ id: 'db-id-1' }),
    },
    appointmentSync: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

describe('LeyrMockService', () => {
  let service: LeyrMockService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrismaStub();
    service = new LeyrMockService(prisma);
  });

  describe('getEmrs', () => {
    it('returns mock EMR list', async () => {
      const emrs = await service.getEmrs();
      expect(emrs).toBeInstanceOf(Array);
      expect(emrs.length).toBeGreaterThan(0);
      expect(emrs[0]).toHaveProperty('id');
      expect(emrs[0]).toHaveProperty('name');
    });
  });

  describe('getCareUnits', () => {
    it('returns Stockholm and Oslo care units', async () => {
      const units = await service.getCareUnits();
      expect(units.length).toBe(2);
      const names = units.map((u: { name: string }) => u.name);
      expect(names.some((n: string) => n.includes('Stockholm'))).toBe(true);
      expect(names.some((n: string) => n.includes('Oslo'))).toBe(true);
    });
  });

  describe('findPatients', () => {
    it('filters patients by care unit', async () => {
      const stockholmPatients = await service.findPatients('cu-stockholm-01');
      const osloPatients = await service.findPatients('cu-oslo-01');

      expect(stockholmPatients.length).toBeGreaterThan(0);
      expect(osloPatients.length).toBeGreaterThan(0);
      expect(
        stockholmPatients.length + osloPatients.length,
      ).toBeLessThanOrEqual(4);
    });

    it('filters by first name', async () => {
      const result = await service.findPatients('cu-stockholm-01', 'Erik');
      expect(result.length).toBe(1);
      expect(result[0].first_name).toBe('Erik');
    });

    it('filters by last name', async () => {
      const result = await service.findPatients(
        'cu-oslo-01',
        undefined,
        'Hansen',
      );
      expect(result.length).toBe(1);
      expect(result[0].last_name).toBe('Hansen');
    });

    it('returns empty when no match', async () => {
      const result = await service.findPatients(
        'cu-stockholm-01',
        'NonExistent',
      );
      expect(result.length).toBe(0);
    });
  });

  describe('getPatient', () => {
    it('returns patient by id and care unit', async () => {
      const patient = await service.getPatient('cu-stockholm-01', 'pat-se-001');
      expect(patient).toBeDefined();
      expect(patient!.first_name).toBe('Erik');
    });

    it('returns null for non-existent patient', async () => {
      const patient = await service.getPatient(
        'cu-stockholm-01',
        'non-existent',
      );
      expect(patient).toBeNull();
    });
  });

  describe('getHealthcareServices', () => {
    it('returns services for Stockholm', async () => {
      const services = await service.getHealthcareServices('cu-stockholm-01');
      expect(services.length).toBeGreaterThan(0);
      expect(services[0]).toHaveProperty('duration');
      expect(services[0]).toHaveProperty('price');
    });

    it('returns services for Oslo', async () => {
      const services = await service.getHealthcareServices('cu-oslo-01');
      expect(services.length).toBeGreaterThan(0);
    });
  });

  describe('getResources', () => {
    it('returns practitioners for Stockholm', async () => {
      const resources = await service.getResources('cu-stockholm-01');
      expect(resources.length).toBe(2);
      expect(resources[0].type).toBe('practitioner');
    });

    it('returns practitioners for Oslo', async () => {
      const resources = await service.getResources('cu-oslo-01');
      expect(resources.length).toBe(1);
    });
  });

  describe('getTimeslots', () => {
    it('generates timeslots for weekdays only', async () => {
      const monday = new Date('2026-06-15T00:00:00Z');
      const friday = new Date('2026-06-19T23:59:59Z');

      const slots = await service.getTimeslots(
        'cu-stockholm-01',
        undefined,
        undefined,
        monday.toISOString(),
        friday.toISOString(),
      );

      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        const day = new Date(slot.start as string).getDay();
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(5);
      }
    });

    it('uses Europe/Stockholm timezone for Stockholm', async () => {
      const slots = await service.getTimeslots(
        'cu-stockholm-01',
        undefined,
        undefined,
        '2026-06-15T00:00:00Z',
        '2026-06-15T23:59:59Z',
      );

      if (slots.length > 0) {
        expect(slots[0].timezone).toBe('Europe/Stockholm');
      }
    });

    it('uses Europe/Oslo timezone for Oslo', async () => {
      const slots = await service.getTimeslots(
        'cu-oslo-01',
        undefined,
        undefined,
        '2026-06-15T00:00:00Z',
        '2026-06-15T23:59:59Z',
      );

      if (slots.length > 0) {
        expect(slots[0].timezone).toBe('Europe/Oslo');
      }
    });
  });

  describe('createAppointment', () => {
    const payload = {
      start: '2026-06-15T09:00:00+02:00',
      end: '2026-06-15T10:00:00+02:00',
      healthcare_service_id: 'hs-001',
      resource_id: 'res-001',
      patient_id: 'pat-se-001',
      comment: 'Routine checkup',
    };

    it('returns appointment with generated id', async () => {
      const result = await service.createAppointment(
        'cu-stockholm-01',
        payload,
      );

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0].id).toBeDefined();
      expect((result[0].id as string).startsWith('leyr-mock-')).toBe(true);
      expect(result[0].status).toBe('booked');
    });

    it('persists to Prisma', async () => {
      await service.createAppointment('cu-stockholm-01', payload);

      expect(prisma.leyrAppointment.upsert).toHaveBeenCalled();
    });

    it('enqueues sync by default', async () => {
      await service.createAppointment('cu-stockholm-01', payload);

      expect(prisma.appointmentSync.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            direction: 'LEYR_TO_GHL',
            status: 'pending',
          }),
        }),
      );
    });

    it('skips sync when enqueueSync=false', async () => {
      await service.createAppointment('cu-stockholm-01', payload, undefined, {
        enqueueSync: false,
      });

      expect(prisma.appointmentSync.upsert).not.toHaveBeenCalled();
    });

    it('assigns Europe/Oslo timezone for Oslo care unit', async () => {
      const result = await service.createAppointment('cu-oslo-01', payload);
      expect(result[0].timezone).toBe('Europe/Oslo');
    });
  });

  describe('getMedicalNotes', () => {
    it('returns mock notes', async () => {
      const notes = await service.getMedicalNotes(
        'cu-stockholm-01',
        'pat-se-001',
      );
      expect(notes.length).toBe(1);
      expect(notes[0].patient_id).toBe('pat-se-001');
    });
  });
});
