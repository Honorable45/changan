-- CreateEnum
CREATE TYPE "CommercialStatus" AS ENUM ('TO_CONFIRM', 'MARKETED_TOGO');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('UNCONFIRMED', 'AVAILABLE', 'ON_ORDER', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "Energy" AS ENUM ('PETROL', 'DIESEL', 'HYBRID', 'PLUG_IN_HYBRID', 'RANGE_EXTENDER', 'ELECTRIC');

-- CreateEnum
CREATE TYPE "SpecGroup" AS ENUM ('POWERTRAIN', 'DIMENSIONS', 'COMFORT', 'TECHNOLOGY', 'SAFETY', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "SpecVerification" AS ENUM ('CONFIRMED_TOGO', 'INTERNATIONAL_SOURCE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'MODEL_3D', 'SPIN_FRAME');

-- CreateEnum
CREATE TYPE "MediaView" AS ENUM ('FRONT', 'REAR', 'SIDE', 'THREE_QUARTER', 'INTERIOR', 'DASHBOARD', 'SEATS', 'TRUNK', 'WHEELS', 'LIGHTS', 'DETAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('PRICE', 'TEST_DRIVE', 'INFORMATION');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED');

-- CreateTable
CREATE TABLE "VehicleCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VehicleCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "summary" TEXT,
    "categoryId" TEXT NOT NULL,
    "energies" "Energy"[],
    "published" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "commercialStatus" "CommercialStatus" NOT NULL DEFAULT 'TO_CONFIRM',
    "availability" "Availability" NOT NULL DEFAULT 'UNCONFIRMED',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleVersion" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "priceFcfa" INTEGER,
    "priceVisible" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VehicleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSpecification" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "group" "SpecGroup" NOT NULL,
    "key" TEXT,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "verification" "SpecVerification" NOT NULL DEFAULT 'INTERNATIONAL_SOURCE',
    "sourceLabel" TEXT,
    "sourceUrl" TEXT,

    CONSTRAINT "VehicleSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleColor" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VehicleColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleMedia" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
    "view" "MediaView" NOT NULL DEFAULT 'OTHER',
    "colorId" TEXT,
    "alt" TEXT NOT NULL DEFAULT '',
    "files" JSONB NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "dominantColor" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "credit" TEXT,
    "license" TEXT,
    "licenseUrl" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "vehicleId" TEXT,
    "versionLabel" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "demoMode" BOOLEAN NOT NULL DEFAULT true,
    "heroVehicleId" TEXT,
    "featuredVehicleId" TEXT,
    "logoUrl" TEXT,
    "whatsappNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "openingHours" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "linkedinUrl" TEXT,
    "dealerName" TEXT,
    "warrantyText" TEXT,
    "testDriveConditions" TEXT,
    "legalNotice" TEXT,
    "privacyPolicy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCategory_slug_key" ON "VehicleCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_slug_key" ON "Vehicle"("slug");

-- CreateIndex
CREATE INDEX "Vehicle_published_position_idx" ON "Vehicle"("published", "position");

-- CreateIndex
CREATE INDEX "VehicleVersion_vehicleId_idx" ON "VehicleVersion"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleSpecification_vehicleId_group_idx" ON "VehicleSpecification"("vehicleId", "group");

-- CreateIndex
CREATE INDEX "VehicleColor_vehicleId_idx" ON "VehicleColor"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleMedia_vehicleId_kind_position_idx" ON "VehicleMedia"("vehicleId", "kind", "position");

-- CreateIndex
CREATE INDEX "ContactRequest_status_createdAt_idx" ON "ContactRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "VehicleCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleVersion" ADD CONSTRAINT "VehicleVersion_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSpecification" ADD CONSTRAINT "VehicleSpecification_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleColor" ADD CONSTRAINT "VehicleColor_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMedia" ADD CONSTRAINT "VehicleMedia_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMedia" ADD CONSTRAINT "VehicleMedia_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "VehicleColor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
