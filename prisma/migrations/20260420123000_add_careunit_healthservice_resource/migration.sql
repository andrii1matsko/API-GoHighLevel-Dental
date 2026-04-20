-- CreateTable
CREATE TABLE "CareUnit" (
    "id" TEXT NOT NULL,
    "emrId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "instanceName" TEXT,
    "phones" JSONB,
    "emails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthService" (
    "id" TEXT NOT NULL,
    "emrId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "duration" INTEGER NOT NULL,
    "category" TEXT,
    "careUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "emrId" TEXT NOT NULL,
    "externalId" TEXT,
    "externalIdType" TEXT,
    "type" TEXT NOT NULL,
    "emails" JSONB,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "description" TEXT,
    "careUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareUnit_emrId_key" ON "CareUnit"("emrId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthService_emrId_key" ON "HealthService"("emrId");

-- CreateIndex
CREATE INDEX "HealthService_careUnitId_idx" ON "HealthService"("careUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_emrId_key" ON "Resource"("emrId");

-- CreateIndex
CREATE INDEX "Resource_careUnitId_idx" ON "Resource"("careUnitId");

-- AddForeignKey
ALTER TABLE "HealthService" ADD CONSTRAINT "HealthService_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
