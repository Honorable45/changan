import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequestType } from '@prisma/client';
import { Equals, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { PrismaService } from '../common/prisma.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const blankToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value);

class CreateRequestDto {
  @IsEnum(RequestType) type: RequestType;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name: string;
  @Transform(trim) @Matches(/^\+?[0-9 ().-]{8,20}$/, { message: 'Numéro de téléphone invalide' }) phone: string;
  @Transform(blankToUndefined) @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(1500) message?: string;
  @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(120) vehicleSlug?: string;
  @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(120) versionLabel?: string;
  /** Champ piège invisible : les robots le remplissent. */
  @IsOptional() @ValidateIf((o) => o.website !== '') @IsString() website?: string;
  @Equals(true, { message: 'Le consentement est nécessaire pour traiter votre demande' }) consent: boolean;
}

@ApiTags('demandes commerciales')
@Controller('contact-requests')
export class RequestsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Enregistre une demande de prix, d’essai ou d’information' })
  async create(@Body() dto: CreateRequestDto) {
    if (dto.website) return { ok: true };
    const vehicle = dto.vehicleSlug
      ? await this.prisma.vehicle.findFirst({ where: { slug: dto.vehicleSlug, published: true }, select: { id: true } })
      : null;
    await this.prisma.contactRequest.create({
      data: { type: dto.type, name: dto.name, phone: dto.phone, email: dto.email, message: dto.message, versionLabel: dto.versionLabel, vehicleId: vehicle?.id },
    });
    return { ok: true };
  }
}
