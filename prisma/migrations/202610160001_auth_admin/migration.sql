CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPER_ADMIN');
CREATE TYPE "MemberRole" AS ENUM ('OPERATOR_OWNER', 'OPERATOR_DISPATCHER', 'OPERATOR_VIEWER', 'DRIVER');
CREATE TYPE "OperatorStatus" AS ENUM ('LEAD', 'CONTRACTED', 'ONBOARDING', 'DOCS_PENDING', 'UNDER_REVIEW', 'APPROVED', 'GENERATING', 'ASSISTANT_TRAINING', 'SANDBOX', 'CLIENT_REVIEW', 'LIVE', 'RESTRICTED', 'SUSPENDED');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY, "name" TEXT, "email" TEXT NOT NULL, "emailVerified" TIMESTAMP(3), "image" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true, "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_email_canonical" CHECK ("email" = lower(trim("email")))
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Account" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "type" TEXT NOT NULL, "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL, "refresh_token" TEXT, "access_token" TEXT, "expires_at" INTEGER,
  "token_type" TEXT, "scope" TEXT, "id_token" TEXT, "session_state" TEXT,
  CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY, "sessionToken" TEXT NOT NULL, "userId" TEXT NOT NULL, "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE TABLE "VerificationToken" ("identifier" TEXT NOT NULL, "token" TEXT NOT NULL, "expires" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE INDEX "VerificationToken_expires_idx" ON "VerificationToken"("expires");

CREATE TABLE "LoginThrottle" ("key" TEXT PRIMARY KEY, "attempts" INTEGER NOT NULL DEFAULT 1, "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE "Organization" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

CREATE TABLE "OrganizationMember" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "role" "MemberRole" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX "OrganizationMember_userId_active_idx" ON "OrganizationMember"("userId", "active");

CREATE TABLE "OperatorProfile" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "responsibleName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL, "contactPhone" TEXT NOT NULL, "plan" TEXT NOT NULL,
  "setupPaid" BOOLEAN NOT NULL DEFAULT false, "monthlyPriceCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR', "primaryLanguage" TEXT NOT NULL DEFAULT 'pt',
  "status" "OperatorStatus" NOT NULL DEFAULT 'LEAD', "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OperatorProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperatorProfile_price_nonnegative" CHECK ("monthlyPriceCents" >= 0),
  CONSTRAINT "OperatorProfile_version_nonnegative" CHECK ("version" >= 0)
);
CREATE UNIQUE INDEX "OperatorProfile_organizationId_key" ON "OperatorProfile"("organizationId");
CREATE INDEX "OperatorProfile_status_idx" ON "OperatorProfile"("status");

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
