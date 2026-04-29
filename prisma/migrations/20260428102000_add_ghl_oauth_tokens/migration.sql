-- CreateTable
CREATE TABLE "GhlOAuthToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshToken" TEXT NOT NULL,
    "tokenType" TEXT,
    "scope" TEXT,
    "refreshTokenId" TEXT,
    "userId" TEXT,
    "isBulkInstallation" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GhlOAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GhlOAuthToken_companyId_locationId_userType_key" ON "GhlOAuthToken"("companyId", "locationId", "userType");

-- CreateIndex
CREATE INDEX "GhlOAuthToken_companyId_userType_idx" ON "GhlOAuthToken"("companyId", "userType");

-- CreateIndex
CREATE INDEX "GhlOAuthToken_locationId_userType_idx" ON "GhlOAuthToken"("locationId", "userType");
