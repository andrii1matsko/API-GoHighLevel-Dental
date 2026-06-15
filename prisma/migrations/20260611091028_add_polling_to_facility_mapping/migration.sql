-- AlterTable
ALTER TABLE "FacilityMapping" ADD COLUMN     "lastPolledAt" TIMESTAMP(3),
ADD COLUMN     "pollingEnabled" BOOLEAN NOT NULL DEFAULT true;
