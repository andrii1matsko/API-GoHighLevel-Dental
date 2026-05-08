import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Deterministic IDs for referential integrity
// ---------------------------------------------------------------------------
const IDS = {
  users: {
    admin: 'seed-user-admin',
    dentist1: 'seed-user-dentist-1',
    dentist2: 'seed-user-dentist-2',
  },
  careUnits: {
    stockholm: 'seed-cu-stockholm',
    oslo: 'seed-cu-oslo',
  },
  healthServices: {
    checkup: 'seed-hs-checkup',
    cleaning: 'seed-hs-cleaning',
    filling: 'seed-hs-filling',
    rootCanal: 'seed-hs-root-canal',
  },
  resources: {
    drAndersson: 'seed-res-andersson',
    drHansen: 'seed-res-hansen',
    hyg1: 'seed-res-hygienist-1',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function daysFromNow(days: number, hour = 9, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function hoursLater(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function minutesLater(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------
async function seedUsers() {
  const hash = await bcrypt.hash('password123', 10);

  const users = [
    {
      id: IDS.users.admin,
      email: 'admin@dentalclinic.se',
      passwordHash: hash,
      name: 'Admin User',
    },
    {
      id: IDS.users.dentist1,
      email: 'anna.andersson@dentalclinic.se',
      passwordHash: hash,
      name: 'Dr. Anna Andersson',
    },
    {
      id: IDS.users.dentist2,
      email: 'erik.hansen@dentalclinic.no',
      passwordHash: hash,
      name: 'Dr. Erik Hansen',
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { email: u.email, name: u.name },
      create: u,
    });
  }

  console.log(`  ✔ ${users.length} users`);
}

async function seedCareUnits() {
  const units = [
    {
      id: IDS.careUnits.stockholm,
      emrId: 'opus-cu-stockholm-001',
      name: 'Tandläkare Stockholm City',
      address: {
        street: 'Sveavägen 42',
        city: 'Stockholm',
        postalCode: '111 34',
        country: 'SE',
      },
      instanceId: 1,
      instanceName: 'Opus Dental SE',
      phones: ['+46 8 123 45 67'],
      emails: ['reception@tandlakare-stockholm.se'],
    },
    {
      id: IDS.careUnits.oslo,
      emrId: 'opus-cu-oslo-001',
      name: 'Tannlege Oslo Sentrum',
      address: {
        street: 'Karl Johans gate 15',
        city: 'Oslo',
        postalCode: '0154',
        country: 'NO',
      },
      instanceId: 2,
      instanceName: 'Opus Dental NO',
      phones: ['+47 22 33 44 55'],
      emails: ['post@tannlege-oslo.no'],
    },
  ];

  for (const cu of units) {
    await prisma.careUnit.upsert({
      where: { id: cu.id },
      update: { name: cu.name, address: cu.address },
      create: cu,
    });
  }

  console.log(`  ✔ ${units.length} care units (Stockholm + Oslo)`);
}

async function seedHealthServices() {
  const services = [
    {
      id: IDS.healthServices.checkup,
      emrId: 'opus-hs-checkup',
      name: 'Undersökning / Examination',
      description: 'Comprehensive dental examination including X-rays',
      price: 850,
      duration: 30,
      category: 'Examination',
      careUnitId: IDS.careUnits.stockholm,
    },
    {
      id: IDS.healthServices.cleaning,
      emrId: 'opus-hs-cleaning',
      name: 'Tandhygienist / Cleaning',
      description: 'Professional teeth cleaning and scaling',
      price: 1200,
      duration: 45,
      category: 'Hygiene',
      careUnitId: IDS.careUnits.stockholm,
    },
    {
      id: IDS.healthServices.filling,
      emrId: 'opus-hs-filling',
      name: 'Fyllning / Filling',
      description: 'Composite resin dental filling',
      price: 1500,
      duration: 60,
      category: 'Restorative',
      careUnitId: IDS.careUnits.stockholm,
    },
    {
      id: IDS.healthServices.rootCanal,
      emrId: 'opus-hs-root-canal',
      name: 'Rotbehandling / Root Canal',
      description: 'Root canal treatment for infected tooth',
      price: 4500,
      duration: 90,
      category: 'Endodontics',
      careUnitId: IDS.careUnits.oslo,
    },
  ];

  for (const hs of services) {
    await prisma.healthService.upsert({
      where: { id: hs.id },
      update: { name: hs.name, price: hs.price },
      create: hs,
    });
  }

  console.log(`  ✔ ${services.length} healthcare services`);
}

async function seedResources() {
  const resources = [
    {
      id: IDS.resources.drAndersson,
      emrId: 'opus-res-andersson',
      type: 'Practitioner',
      name: 'Dr. Anna Andersson',
      firstName: 'Anna',
      lastName: 'Andersson',
      description: 'General dentist, 12 years experience',
      emails: ['anna.andersson@dentalclinic.se'],
      careUnitId: IDS.careUnits.stockholm,
    },
    {
      id: IDS.resources.drHansen,
      emrId: 'opus-res-hansen',
      type: 'Practitioner',
      name: 'Dr. Erik Hansen',
      firstName: 'Erik',
      lastName: 'Hansen',
      description: 'Endodontist specialist',
      emails: ['erik.hansen@dentalclinic.no'],
      careUnitId: IDS.careUnits.oslo,
    },
    {
      id: IDS.resources.hyg1,
      emrId: 'opus-res-hygienist-1',
      type: 'Practitioner',
      name: 'Lisa Nilsson',
      firstName: 'Lisa',
      lastName: 'Nilsson',
      description: 'Dental hygienist',
      emails: ['lisa.nilsson@dentalclinic.se'],
      careUnitId: IDS.careUnits.stockholm,
    },
  ];

  for (const r of resources) {
    await prisma.resource.upsert({
      where: { id: r.id },
      update: { name: r.name },
      create: r,
    });
  }

  console.log(`  ✔ ${resources.length} resources (practitioners)`);
}

async function seedLeyrAppointments() {
  const appointments = [
    {
      id: 'seed-leyr-apt-1',
      leyrAppointmentId: 'leyr-ext-apt-001',
      emr: 'opus',
      emrId: 'opus-apt-001',
      careUnitId: IDS.careUnits.stockholm,
      patientId: 'patient-svensson-001',
      resourceId: IDS.resources.drAndersson,
      healthcareServiceId: IDS.healthServices.checkup,
      startAt: daysFromNow(1, 9, 0),
      endAt: daysFromNow(1, 9, 30),
      status: 'booked',
      description: 'Annual checkup – Anna Svensson',
      comment: 'Patient prefers morning appointments',
    },
    {
      id: 'seed-leyr-apt-2',
      leyrAppointmentId: 'leyr-ext-apt-002',
      emr: 'opus',
      emrId: 'opus-apt-002',
      careUnitId: IDS.careUnits.stockholm,
      patientId: 'patient-johansson-002',
      resourceId: IDS.resources.hyg1,
      healthcareServiceId: IDS.healthServices.cleaning,
      startAt: daysFromNow(1, 10, 0),
      endAt: daysFromNow(1, 10, 45),
      status: 'booked',
      description: 'Cleaning – Karl Johansson',
    },
    {
      id: 'seed-leyr-apt-3',
      leyrAppointmentId: 'leyr-ext-apt-003',
      emr: 'opus',
      emrId: 'opus-apt-003',
      careUnitId: IDS.careUnits.oslo,
      patientId: 'patient-berg-003',
      resourceId: IDS.resources.drHansen,
      healthcareServiceId: IDS.healthServices.rootCanal,
      startAt: daysFromNow(2, 13, 0),
      endAt: daysFromNow(2, 14, 30),
      status: 'booked',
      description: 'Root canal treatment – Ingrid Berg',
      comment: 'Referred from general dentist',
    },
    {
      id: 'seed-leyr-apt-4',
      leyrAppointmentId: 'leyr-ext-apt-004',
      emr: 'opus',
      careUnitId: IDS.careUnits.stockholm,
      patientId: 'patient-lindqvist-004',
      resourceId: IDS.resources.drAndersson,
      healthcareServiceId: IDS.healthServices.filling,
      startAt: daysFromNow(-3, 11, 0),
      endAt: daysFromNow(-3, 12, 0),
      status: 'fulfilled',
      description: 'Filling molar #36 – completed',
    },
    {
      id: 'seed-leyr-apt-5',
      leyrAppointmentId: 'leyr-ext-apt-005',
      emr: 'opus',
      careUnitId: IDS.careUnits.oslo,
      patientId: 'patient-olsen-005',
      resourceId: IDS.resources.drHansen,
      healthcareServiceId: IDS.healthServices.checkup,
      startAt: daysFromNow(-1, 8, 30),
      endAt: daysFromNow(-1, 9, 0),
      status: 'cancelled',
      description: 'Cancelled by patient',
      comment: 'Patient called to reschedule',
    },
  ];

  for (const apt of appointments) {
    await prisma.leyrAppointment.upsert({
      where: { id: apt.id },
      update: { status: apt.status },
      create: apt,
    });
  }

  console.log(`  ✔ ${appointments.length} Leyr appointments (booked, fulfilled, cancelled)`);
}

async function seedGhlAppointments() {
  const appointments = [
    {
      id: 'seed-ghl-apt-1',
      ghlAppointmentId: 'ghl-ext-apt-001',
      locationId: 'ghl-loc-stockholm',
      calendarId: 'ghl-cal-stockholm-main',
      contactId: 'ghl-contact-svensson',
      assignedUserId: 'ghl-user-andersson',
      startAt: daysFromNow(1, 9, 0),
      endAt: daysFromNow(1, 9, 30),
      title: 'Dental Checkup – Anna Svensson',
      status: 'confirmed',
    },
    {
      id: 'seed-ghl-apt-2',
      ghlAppointmentId: 'ghl-ext-apt-002',
      locationId: 'ghl-loc-stockholm',
      calendarId: 'ghl-cal-stockholm-main',
      contactId: 'ghl-contact-johansson',
      assignedUserId: 'ghl-user-nilsson',
      startAt: daysFromNow(1, 10, 0),
      endAt: daysFromNow(1, 10, 45),
      title: 'Teeth Cleaning – Karl Johansson',
      status: 'confirmed',
    },
    {
      id: 'seed-ghl-apt-3',
      ghlAppointmentId: 'ghl-ext-apt-003',
      locationId: 'ghl-loc-oslo',
      calendarId: 'ghl-cal-oslo-main',
      contactId: 'ghl-contact-berg',
      assignedUserId: 'ghl-user-hansen',
      startAt: daysFromNow(2, 13, 0),
      endAt: daysFromNow(2, 14, 30),
      title: 'Root Canal – Ingrid Berg',
      status: 'confirmed',
    },
    {
      id: 'seed-ghl-apt-4',
      ghlAppointmentId: 'ghl-ext-apt-004',
      locationId: 'ghl-loc-stockholm',
      calendarId: 'ghl-cal-stockholm-main',
      contactId: 'ghl-contact-lindqvist',
      startAt: daysFromNow(-3, 11, 0),
      endAt: daysFromNow(-3, 12, 0),
      title: 'Filling – Past Appointment',
      status: 'showed',
    },
    {
      id: 'seed-ghl-apt-5',
      ghlAppointmentId: 'ghl-ext-apt-005',
      locationId: 'ghl-loc-oslo',
      calendarId: 'ghl-cal-oslo-main',
      contactId: 'ghl-contact-olsen',
      startAt: daysFromNow(3, 15, 0),
      endAt: daysFromNow(3, 15, 30),
      title: 'Follow-up – pending sync',
      status: 'confirmed',
    },
    {
      id: 'seed-ghl-apt-6',
      ghlAppointmentId: 'ghl-ext-apt-006',
      locationId: 'ghl-loc-stockholm',
      calendarId: 'ghl-cal-stockholm-main',
      contactId: 'ghl-contact-failed',
      startAt: daysFromNow(4, 10, 0),
      endAt: daysFromNow(4, 10, 30),
      title: 'Appointment with sync failure',
      status: 'confirmed',
    },
  ];

  for (const apt of appointments) {
    await prisma.ghlAppointment.upsert({
      where: { id: apt.id },
      update: { status: apt.status },
      create: apt,
    });
  }

  console.log(`  ✔ ${appointments.length} GHL appointments`);
}

async function seedAppointmentSyncs() {
  const now = new Date();
  const syncs = [
    {
      id: 'seed-sync-1',
      direction: 'GHL_TO_LEYR',
      status: 'success',
      sourceSystem: 'GHL:AppointmentCreate',
      sourceExternalId: 'ghl-ext-apt-001',
      targetSystem: 'LEYR',
      targetExternalId: 'leyr-ext-apt-001',
      idempotencyKey: 'ghl-apt-001-create',
      syncedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      ghlAppointmentId: 'seed-ghl-apt-1',
      leyrAppointmentId: 'seed-leyr-apt-1',
    },
    {
      id: 'seed-sync-2',
      direction: 'GHL_TO_LEYR',
      status: 'success',
      sourceSystem: 'GHL:AppointmentCreate',
      sourceExternalId: 'ghl-ext-apt-002',
      targetSystem: 'LEYR',
      targetExternalId: 'leyr-ext-apt-002',
      idempotencyKey: 'ghl-apt-002-create',
      syncedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      ghlAppointmentId: 'seed-ghl-apt-2',
      leyrAppointmentId: 'seed-leyr-apt-2',
    },
    {
      id: 'seed-sync-3',
      direction: 'GHL_TO_LEYR',
      status: 'success',
      sourceSystem: 'GHL:AppointmentCreate',
      sourceExternalId: 'ghl-ext-apt-003',
      targetSystem: 'LEYR',
      targetExternalId: 'leyr-ext-apt-003',
      idempotencyKey: 'ghl-apt-003-create',
      syncedAt: new Date(now.getTime() - 30 * 60 * 1000),
      ghlAppointmentId: 'seed-ghl-apt-3',
      leyrAppointmentId: 'seed-leyr-apt-3',
    },
    {
      id: 'seed-sync-4',
      direction: 'LEYR_TO_GHL',
      status: 'success',
      sourceSystem: 'LEYR',
      sourceExternalId: 'leyr-ext-apt-004',
      targetSystem: 'GHL',
      targetExternalId: 'ghl-ext-apt-004',
      idempotencyKey: 'leyr-apt-004-create',
      syncedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      leyrAppointmentId: 'seed-leyr-apt-4',
      ghlAppointmentId: 'seed-ghl-apt-4',
    },
    {
      id: 'seed-sync-5',
      direction: 'GHL_TO_LEYR',
      status: 'pending',
      sourceSystem: 'GHL:AppointmentCreate',
      sourceExternalId: 'ghl-ext-apt-005',
      targetSystem: 'LEYR',
      idempotencyKey: 'ghl-apt-005-create',
      ghlAppointmentId: 'seed-ghl-apt-5',
    },
    {
      id: 'seed-sync-6',
      direction: 'GHL_TO_LEYR',
      status: 'failed',
      sourceSystem: 'GHL:AppointmentCreate',
      sourceExternalId: 'ghl-ext-apt-006',
      targetSystem: 'LEYR',
      idempotencyKey: 'ghl-apt-006-create',
      errorMessage: 'Leyr API returned 503: Service temporarily unavailable',
      retryCount: 3,
      ghlAppointmentId: 'seed-ghl-apt-6',
    },
    {
      id: 'seed-sync-7',
      direction: 'LEYR_TO_GHL',
      status: 'pending',
      sourceSystem: 'LEYR',
      sourceExternalId: 'leyr-ext-apt-005',
      targetSystem: 'GHL',
      idempotencyKey: 'leyr-apt-005-create',
      leyrAppointmentId: 'seed-leyr-apt-5',
    },
    {
      id: 'seed-sync-8',
      direction: 'GHL_TO_LEYR',
      status: 'failed',
      sourceSystem: 'GHL:AppointmentUpdate',
      sourceExternalId: 'ghl-ext-apt-001',
      targetSystem: 'LEYR',
      idempotencyKey: 'ghl-apt-001-update-1',
      errorMessage: 'Leyr sync for AppointmentUpdate not implemented yet',
      retryCount: 1,
      ghlAppointmentId: 'seed-ghl-apt-1',
    },
  ];

  for (const s of syncs) {
    await prisma.appointmentSync.upsert({
      where: { id: s.id },
      update: { status: s.status },
      create: s,
    });
  }

  console.log(`  ✔ ${syncs.length} sync records (4 success, 2 pending, 2 failed)`);
}

async function seedGhlOAuthToken() {
  const token = {
    id: 'seed-oauth-token-1',
    companyId: 'ghl-company-dental',
    locationId: 'ghl-loc-stockholm',
    userType: 'Location',
    accessToken: 'seed-access-token-placeholder',
    accessTokenExpiresAt: hoursLater(new Date(), 1),
    refreshToken: 'seed-refresh-token-placeholder',
    tokenType: 'Bearer',
    scope: 'calendars.readonly calendars.write contacts.readonly',
  };

  await prisma.ghlOAuthToken.upsert({
    where: {
      companyId_locationId_userType: {
        companyId: token.companyId,
        locationId: token.locationId,
        userType: token.userType,
      },
    },
    update: { accessToken: token.accessToken },
    create: token,
  });

  console.log('  ✔ 1 GHL OAuth token (Stockholm location)');
}

async function seedAuditLogs() {
  const now = new Date();
  const logs = [
    {
      actorUserId: IDS.users.admin,
      actorEmail: 'admin@dentalclinic.se',
      httpMethod: 'POST',
      path: '/api/auth/login',
      resourceType: 'auth',
      resourceId: 'login_success',
      ip: '192.168.1.10',
      userAgent: 'Mozilla/5.0',
      statusCode: 200,
      durationMs: 142,
    },
    {
      actorEmail: 'hacker@evil.com',
      httpMethod: 'POST',
      path: '/api/auth/login',
      resourceType: 'auth',
      resourceId: 'login_failed',
      ip: '10.0.0.99',
      userAgent: 'curl/7.88.1',
      statusCode: 401,
      durationMs: 89,
      metadata: { reason: 'User not found' },
    },
    {
      actorUserId: IDS.users.dentist1,
      actorEmail: 'anna.andersson@dentalclinic.se',
      httpMethod: 'POST',
      path: '/api/gohighlevel/appointments',
      resourceType: 'appointment',
      resourceId: 'ghl-ext-apt-001',
      ip: '192.168.1.20',
      statusCode: 201,
      durationMs: 523,
    },
    {
      actorUserId: IDS.users.admin,
      actorEmail: 'admin@dentalclinic.se',
      httpMethod: 'POST',
      path: '/api/sync/calendar',
      resourceType: 'sync',
      resourceId: 'manual-trigger',
      ip: '192.168.1.10',
      statusCode: 200,
      durationMs: 2100,
    },
  ];

  await prisma.auditLog.createMany({ data: logs });

  console.log(`  ✔ ${logs.length} audit log entries`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n🌱 Seeding database...\n');

  await seedUsers();
  await seedCareUnits();
  await seedHealthServices();
  await seedResources();
  await seedLeyrAppointments();
  await seedGhlAppointments();
  await seedAppointmentSyncs();
  await seedGhlOAuthToken();
  await seedAuditLogs();

  console.log('\n✅ Seed complete!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
