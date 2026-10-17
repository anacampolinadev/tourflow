-- CreateTable
CREATE TABLE "AssistantProfile" (
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProfile_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "AssistantVersion" (
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "instructions" TEXT NOT NULL,
    "playbookVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantVersion_pkey" PRIMARY KEY ("organizationId","version")
);

-- AddForeignKey
ALTER TABLE "AssistantProfile" ADD CONSTRAINT "AssistantProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantVersion" ADD CONSTRAINT "AssistantVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "AssistantProfile"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssistantProfile" ADD CONSTRAINT "AssistantProfile_version_check" CHECK ("version" BETWEEN 1 AND 100);
ALTER TABLE "AssistantVersion" ADD CONSTRAINT "AssistantVersion_content_check" CHECK ("version" BETWEEN 1 AND 100 AND jsonb_typeof("configuration") = 'object' AND octet_length("configuration"::text) <= 65536 AND octet_length("instructions") BETWEEN 1 AND 65536 AND length("playbookVersion") BETWEEN 1 AND 80);
