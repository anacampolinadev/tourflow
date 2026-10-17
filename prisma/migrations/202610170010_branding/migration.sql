-- CreateTable
CREATE TABLE "BrandProfile" (
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "logo" BYTEA,
    "hasLogo" BOOLEAN NOT NULL DEFAULT false,
    "icon192" BYTEA NOT NULL,
    "icon512" BYTEA NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_identity_limits" CHECK (char_length("displayName") BETWEEN 2 AND 80 AND "primaryColor" ~ '^#[0-9a-f]{6}$' AND "secondaryColor" ~ '^#[0-9a-f]{6}$' AND "version" >= 0);
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_assets_limits" CHECK (octet_length("logo") BETWEEN 1 AND 524288 AND "hasLogo" = ("logo" IS NOT NULL) AND octet_length("icon192") BETWEEN 1 AND 1048576 AND octet_length("icon512") BETWEEN 1 AND 1048576);
