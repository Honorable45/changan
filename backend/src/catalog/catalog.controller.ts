import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Availability, Energy, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { MediaService } from '../media/media.service';

const mediaOrder = [{ isPrimary: 'desc' }, { position: 'asc' }] as Prisma.VehicleMediaOrderByWithRelationInput[];

const cardInclude = {
  category: true,
  // Le catalogue ne charge que la photographie principale de chaque véhicule.
  media: { where: { kind: 'IMAGE', isPrimary: true }, take: 1 },
  versions: { orderBy: { position: 'asc' } },
  specifications: { where: { key: 'engine' }, take: 1 },
} satisfies Prisma.VehicleInclude;

const hidePrice = <T extends { priceFcfa: number | null; priceVisible: boolean }>(v: T) => ({ ...v, priceFcfa: v.priceVisible ? v.priceFcfa : null });

@ApiTags('catalogue public')
@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService, private readonly media: MediaService) {}

  private card(v: Prisma.VehicleGetPayload<{ include: typeof cardInclude }>) {
    const versions = v.versions.map(hidePrice);
    const prices = versions.map((x) => x.priceFcfa).filter((p): p is number => p != null);
    return {
      id: v.id, slug: v.slug, name: v.name, tagline: v.tagline, category: v.category, energies: v.energies,
      commercialStatus: v.commercialStatus, availability: v.availability, isNew: v.isNew, isDemo: v.isDemo,
      priceFromFcfa: prices.length ? Math.min(...prices) : null,
      engine: v.specifications[0]?.value ?? null,
      image: v.media[0] ? this.media.present(v.media[0]) : null,
    };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Catégories contenant au moins un véhicule publié' })
  async categories() {
    const rows = await this.prisma.vehicleCategory.findMany({
      where: { vehicles: { some: { published: true } } },
      orderBy: { position: 'asc' },
      include: { _count: { select: { vehicles: { where: { published: true } } } } },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, count: _count.vehicles }));
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Véhicules publiés, filtrables' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'energy', required: false, enum: Energy })
  @ApiQuery({ name: 'availability', required: false, enum: Availability })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  async vehicles(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('energy') energy?: string,
    @Query('availability') availability?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    const where: Prisma.VehicleWhereInput = { published: true };
    if (q?.trim()) where.name = { contains: q.trim().slice(0, 80), mode: 'insensitive' };
    if (category) where.category = { slug: category };
    if (energy && energy in Energy) where.energies = { has: energy as Energy };
    if (availability && availability in Availability) where.availability = availability as Availability;
    const max = Number(maxPrice);
    if (maxPrice && Number.isFinite(max)) where.versions = { some: { priceVisible: true, priceFcfa: { lte: max } } };
    const rows = await this.prisma.vehicle.findMany({ where, orderBy: { position: 'asc' }, include: cardInclude });
    return rows.map((v) => this.card(v));
  }

  @Get('vehicles/facets')
  @ApiOperation({ summary: 'Valeurs de filtres réellement renseignées : un filtre sans donnée n’est pas proposé' })
  async facets() {
    const rows = await this.prisma.vehicle.findMany({
      where: { published: true },
      select: { energies: true, availability: true, versions: { where: { priceVisible: true, priceFcfa: { not: null } }, select: { priceFcfa: true } } },
    });
    const prices = rows.flatMap((r) => r.versions.map((v) => v.priceFcfa as number));
    return {
      energies: [...new Set(rows.flatMap((r) => r.energies))],
      availabilities: [...new Set(rows.map((r) => r.availability))].filter((a) => a !== 'UNCONFIRMED'),
      priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    };
  }

  @Get('vehicles/credits')
  @ApiOperation({ summary: 'Crédits et licences de tous les médias publiés' })
  async credits() {
    const rows = await this.prisma.vehicleMedia.findMany({
      where: { vehicle: { published: true }, credit: { not: null } },
      select: { id: true, alt: true, credit: true, license: true, licenseUrl: true, sourceUrl: true, vehicle: { select: { name: true, position: true } } },
      orderBy: [{ vehicle: { position: 'asc' } }, { position: 'asc' }],
    });
    return rows;
  }

  @Get('vehicles/:slug')
  @ApiOperation({ summary: 'Fiche détaillée d’un véhicule publié' })
  async vehicle(@Param('slug') slug: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { slug, published: true },
      include: {
        category: true,
        versions: { orderBy: { position: 'asc' } },
        specifications: { orderBy: [{ group: 'asc' }, { position: 'asc' }] },
        colors: { where: { confirmed: true }, orderBy: { position: 'asc' } },
        media: { orderBy: mediaOrder },
      },
    });
    if (!v) throw new NotFoundException('Véhicule introuvable');
    const similar = await this.prisma.vehicle.findMany({
      where: { published: true, categoryId: v.categoryId, id: { not: v.id } },
      orderBy: { position: 'asc' }, take: 3, include: cardInclude,
    });
    const { createdAt, updatedAt, ...rest } = v;
    return {
      ...rest,
      versions: v.versions.map(hidePrice),
      media: v.media.map((m) => this.media.present(m)),
      similar: similar.map((s) => this.card(s)),
    };
  }

  @Get('site')
  @ApiOperation({ summary: 'Coordonnées, mises en avant et paramètres publics' })
  async site() {
    const s = await this.prisma.siteSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    const pick = async (id: string | null) => {
      if (!id) return null;
      const v = await this.prisma.vehicle.findFirst({ where: { id, published: true }, include: cardInclude });
      return v ? this.card(v) : null;
    };
    const { heroVehicleId, featuredVehicleId, updatedAt, id, ...rest } = s;
    return { ...rest, hero: await pick(heroVehicleId), featured: await pick(featuredVehicleId) };
  }
}
