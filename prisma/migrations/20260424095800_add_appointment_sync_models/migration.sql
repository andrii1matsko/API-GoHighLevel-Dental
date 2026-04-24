-- CreateTable
CREATE TABLE "LeyrAppointment" (
    "id" TEXT NOT NULL,
    "leyrAppointmentId" TEXT NOT NULL,
    "emr" TEXT NOT NULL,
    "emrId" TEXT,
    "careUnitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "healthcareServiceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT,
    "description" TEXT,
    "comment" TEXT,
    "participants" JSONB,
    "healthcareServices" JSONB,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeyrAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GhlAppointment" (
    "id" TEXT NOT NULL,
    "ghlAppointmentId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "title" TEXT,
    "status" TEXT,
    "meetingLocationType" TEXT,
    "address" TEXT,
    "isRecurring" BOOLEAN,
    "rrule" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GhlAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentSync" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceExternalId" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "targetExternalId" TEXT,
    "idempotencyKey" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leyrAppointmentId" TEXT,
    "ghlAppointmentId" TEXT,

    CONSTRAINT "AppointmentSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeyrAppointment_leyrAppointmentId_key" ON "LeyrAppointment"("leyrAppointmentId");

-- CreateIndex
CREATE INDEX "LeyrAppointment_emr_careUnitId_startAt_idx" ON "LeyrAppointment"("emr", "careUnitId", "startAt");

-- CreateIndex
CREATE INDEX "LeyrAppointment_patientId_idx" ON "LeyrAppointment"("patientId");

-- CreateIndex
CREATE INDEX "LeyrAppointment_resourceId_idx" ON "LeyrAppointment"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "GhlAppointment_ghlAppointmentId_key" ON "GhlAppointment"("ghlAppointmentId");

-- CreateIndex
CREATE INDEX "GhlAppointment_locationId_calendarId_startAt_idx" ON "GhlAppointment"("locationId", "calendarId", "startAt");

-- CreateIndex
CREATE INDEX "GhlAppointment_contactId_idx" ON "GhlAppointment"("contactId");

-- CreateIndex
CREATE INDEX "GhlAppointment_assignedUserId_idx" ON "GhlAppointment"("assignedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentSync_idempotencyKey_key" ON "AppointmentSync"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AppointmentSync_direction_status_createdAt_idx" ON "AppointmentSync"("direction", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentSync_sourceSystem_sourceExternalId_idx" ON "AppointmentSync"("sourceSystem", "sourceExternalId");

-- CreateIndex
CREATE INDEX "AppointmentSync_targetSystem_targetExternalId_idx" ON "AppointmentSync"("targetSystem", "targetExternalId");

-- AddForeignKey
ALTER TABLE "AppointmentSync" ADD CONSTRAINT "AppointmentSync_leyrAppointmentId_fkey" FOREIGN KEY ("leyrAppointmentId") REFERENCES "LeyrAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSync" ADD CONSTRAINT "AppointmentSync_ghlAppointmentId_fkey" FOREIGN KEY ("ghlAppointmentId") REFERENCES "GhlAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
