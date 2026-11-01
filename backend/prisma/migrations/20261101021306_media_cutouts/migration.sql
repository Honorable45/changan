-- AlterTable
ALTER TABLE "VehicleMedia" ADD COLUMN     "cutoutFiles" JSONB,
ADD COLUMN     "cutoutHeight" INTEGER,
ADD COLUMN     "cutoutWidth" INTEGER;
