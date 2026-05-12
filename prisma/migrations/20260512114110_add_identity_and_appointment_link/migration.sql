-- AlterTable
ALTER TABLE "AppointmentSync" ADD COLUMN     "nextRetryAfter" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IdentityMapping" (
    "id" TEXT NOT NULL,
    "ghlContactId" TEXT NOT NULL,
    "ghlLocationId" TEXT NOT NULL,
    "leyrPatientId" TEXT NOT NULL,
    "leyrEmr" TEXT NOT NULL,
    "leyrCareUnitId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentLink" (
    "id" TEXT NOT NULL,
    "ghlAppointmentId" TEXT NOT NULL,
    "leyrAppointmentId" TEXT NOT NULL,
    "leyrEmr" TEXT NOT NULL,
    "leyrCareUnitId" TEXT NOT NULL,
    "lastSyncDirection" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "echoGuardUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMapping" (
    "id" TEXT NOT NULL,
    "ghlCalendarId" TEXT NOT NULL,
    "ghlCalendarName" TEXT,
    "leyrHealthcareServiceId" TEXT NOT NULL,
    "leyrResourceId" TEXT NOT NULL,
    "leyrCareUnitId" TEXT NOT NULL,
    "leyrEmr" TEXT NOT NULL,

    CONSTRAINT "ServiceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityMapping_ghlContactId_idx" ON "IdentityMapping"("ghlContactId");

-- CreateIndex
CREATE INDEX "IdentityMapping_leyrPatientId_idx" ON "IdentityMapping"("leyrPatientId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityMapping_ghlContactId_ghlLocationId_key" ON "IdentityMapping"("ghlContactId", "ghlLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityMapping_leyrPatientId_leyrEmr_leyrCareUnitId_key" ON "IdentityMapping"("leyrPatientId", "leyrEmr", "leyrCareUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentLink_ghlAppointmentId_key" ON "AppointmentLink"("ghlAppointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentLink_leyrAppointmentId_key" ON "AppointmentLink"("leyrAppointmentId");

-- CreateIndex
CREATE INDEX "AppointmentLink_ghlAppointmentId_idx" ON "AppointmentLink"("ghlAppointmentId");

-- CreateIndex
CREATE INDEX "AppointmentLink_leyrAppointmentId_idx" ON "AppointmentLink"("leyrAppointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMapping_ghlCalendarId_key" ON "ServiceMapping"("ghlCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMapping_leyrHealthcareServiceId_leyrResourceId_leyrC_key" ON "ServiceMapping"("leyrHealthcareServiceId", "leyrResourceId", "leyrCareUnitId");
