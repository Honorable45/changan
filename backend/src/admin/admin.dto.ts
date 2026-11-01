import { Availability, CommercialStatus, Energy, MediaKind, MediaView, RequestStatus, SpecGroup, SpecVerification } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const empty = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value);
const URL_OPTS = { protocols: ['https', 'http'], require_protocol: true, require_tld: false };

export class VehicleDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'URL : minuscules, chiffres et tirets uniquement' }) slug: string;
  @IsString() categoryId: string;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(160) tagline?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(2000) summary?: string | null;
  @IsArray() @IsEnum(Energy, { each: true }) energies: Energy[];
  @IsBoolean() published: boolean;
  @IsBoolean() isNew: boolean;
  @IsBoolean() isDemo: boolean;
  @IsEnum(CommercialStatus) commercialStatus: CommercialStatus;
  @IsEnum(Availability) availability: Availability;
  @IsInt() position: number;
}

export class CategoryDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/) slug: string;
  @IsInt() position: number;
}

export class VersionDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsInt() @Min(1980) year?: number | null;
  @IsOptional() @IsInt() @Min(0) priceFcfa?: number | null;
  @IsBoolean() priceVisible: boolean;
  @IsInt() position: number;
}

export class SpecDto {
  @IsEnum(SpecGroup) group: SpecGroup;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(40) key?: string | null;
  @IsString() @MinLength(1) @MaxLength(80) label: string;
  @IsString() @MinLength(1) @MaxLength(300) value: string;
  @IsInt() position: number;
  @IsEnum(SpecVerification) verification: SpecVerification;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(160) sourceLabel?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) sourceUrl?: string | null;
}

export class ColorDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @Transform(empty) @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) hex?: string | null;
  @IsBoolean() confirmed: boolean;
  @IsInt() position: number;
}

export class UploadMediaDto {
  @IsEnum(MediaKind) kind: MediaKind;
  @IsOptional() @IsEnum(MediaView) view?: MediaView;
  @IsOptional() @IsString() @MaxLength(240) alt?: string;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(160) credit?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(60) license?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) licenseUrl?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) sourceUrl?: string | null;
}

export class UpdateMediaDto {
  @IsOptional() @IsEnum(MediaView) view?: MediaView;
  @IsOptional() @IsString() @MaxLength(240) alt?: string;
  @Transform(empty) @IsOptional() @IsString() colorId?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(160) credit?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(60) license?: string | null;
}

export class ReorderDto {
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) ids: string[];
}

export class RequestStatusDto {
  @IsEnum(RequestStatus) status: RequestStatus;
}

export class SettingsDto {
  @IsOptional() @IsBoolean() demoMode?: boolean;
  @Transform(empty) @IsOptional() @IsString() heroVehicleId?: string | null;
  @Transform(empty) @IsOptional() @IsString() featuredVehicleId?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) logoUrl?: string | null;
  /** Format international sans espace ni « + ». */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[^0-9]/g, '') || null : value))
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^[1-9][0-9]{7,14}$/, { message: 'Numéro WhatsApp invalide : indicatif pays obligatoire' })
  whatsappNumber?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(200) email?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(300) address?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(300) openingHours?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) facebookUrl?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) instagramUrl?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) tiktokUrl?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) youtubeUrl?: string | null;
  @Transform(empty) @IsOptional() @IsUrl(URL_OPTS) linkedinUrl?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(120) dealerName?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(4000) warrantyText?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(4000) testDriveConditions?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(20000) legalNotice?: string | null;
  @Transform(empty) @IsOptional() @IsString() @MaxLength(20000) privacyPolicy?: string | null;
}

