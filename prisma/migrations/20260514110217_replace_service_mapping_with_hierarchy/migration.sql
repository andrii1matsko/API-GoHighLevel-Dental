/*
  Warnings:

  - You are about to drop the `ServiceMapping` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "ServiceMapping";

-- CreateTable
CREATE TABLE "FacilityMapping" (
    "id" TEXT NOT NULL,
    "ghlLocationId" TEXT NOT NULL,
    "ghlGroupId" TEXT NOT NULL,
    "ghlGroupName" TEXT,
    "leyrCareUnitId" TEXT NOT NULL,
    "leyrEmr" TEXT NOT NULL,
    "leyrCareUnitName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarServiceMapping" (
    "id" TEXT NOT NULL,
    "facilityMappingId" TEXT NOT NULL,
    "ghlCalendarId" TEXT NOT NULL,
    "ghlCalendarName" TEXT,
    "leyrHealthcareServiceId" TEXT NOT NULL,
    "leyrServiceName" TEXT,

    CONSTRAINT "CalendarServiceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffResourceMapping" (
    "id" TEXT NOT NULL,
    "facilityMappingId" TEXT NOT NULL,
    "ghlUserId" TEXT NOT NULL,
    "ghlUserName" TEXT,
    "ghlUserEmail" TEXT,
    "leyrResourceId" TEXT NOT NULL,
    "leyrResourceName" TEXT,

    CONSTRAINT "StaffResourceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacilityMapping_ghlLocationId_idx" ON "FacilityMapping"("ghlLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityMapping_ghlGroupId_ghlLocationId_key" ON "FacilityMapping"("ghlGroupId", "ghlLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityMapping_leyrCareUnitId_leyrEmr_key" ON "FacilityMapping"("leyrCareUnitId", "leyrEmr");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarServiceMapping_ghlCalendarId_key" ON "CalendarServiceMapping"("ghlCalendarId");

-- CreateIndex
CREATE INDEX "CalendarServiceMapping_facilityMappingId_idx" ON "CalendarServiceMapping"("facilityMappingId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarServiceMapping_leyrHealthcareServiceId_facilityMapp_key" ON "CalendarServiceMapping"("leyrHealthcareServiceId", "facilityMappingId");

-- CreateIndex
CREATE INDEX "StaffResourceMapping_facilityMappingId_idx" ON "StaffResourceMapping"("facilityMappingId");

-- CreateIndex
CREATE INDEX "StaffResourceMapping_ghlUserId_idx" ON "StaffResourceMapping"("ghlUserId");

-- CreateIndex
CREATE INDEX "StaffResourceMapping_leyrResourceId_idx" ON "StaffResourceMapping"("leyrResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffResourceMapping_ghlUserId_facilityMappingId_key" ON "StaffResourceMapping"("ghlUserId", "facilityMappingId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffResourceMapping_leyrResourceId_facilityMappingId_key" ON "StaffResourceMapping"("leyrResourceId", "facilityMappingId");

-- AddForeignKey
ALTER TABLE "CalendarServiceMapping" ADD CONSTRAINT "CalendarServiceMapping_facilityMappingId_fkey" FOREIGN KEY ("facilityMappingId") REFERENCES "FacilityMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffResourceMapping" ADD CONSTRAINT "StaffResourceMapping_facilityMappingId_fkey" FOREIGN KEY ("facilityMappingId") REFERENCES "FacilityMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
