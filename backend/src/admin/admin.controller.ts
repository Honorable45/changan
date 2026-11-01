import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/auth.guard';
import { PrismaService } from '../common/prisma.service';
import { LIMITS, MediaService } from '../media/media.service';
import { CategoryDto, ColorDto, ReorderDto, RequestStatusDto, SettingsDto, SpecDto, UpdateMediaDto, UploadMediaDto, VehicleDto, VersionDto } from './admin.dto';

@ApiTags('administration')
@ApiCookieAuth('changan_admin')
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly media: MediaService) {}

  // --- Véhicules
  @Get('vehicles')
  async vehicles() {
    const rows = await this.prisma.vehicle.findMany({
      orderBy: { position: 'asc' },
      include: { category: true, media: { where: { kind: 'IMAGE', isPrimary: true }, take: 1 }, _count: { select: { media: true, specifications: true, versions: true } } },
    });
    return rows.map((v) => ({ ...v, media: v.media.map((m) => this.media.present(m)) }));
  }

  @Get('vehicles/:id')
  async vehicle(@Param('id') id: string) {
    const v = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { position: 'asc' } },
        specifications: { orderBy: [{ group: 'asc' }, { position: 'asc' }] },
        colors: { orderBy: { position: 'asc' } },
        media: { orderBy: [{ kind: 'asc' }, { position: 'asc' }] },
      },
    });
    if (!v) throw new NotFoundException();
    return { ...v, media: v.media.map((m) => this.media.present(m)) };
  }

  @Post('vehicles')
  createVehicle(@Body() dto: VehicleDto) {
    return this.prisma.vehicle.create({ data: dto });
  }

  @Put('vehicles/:id')
  updateVehicle(@Param('id') id: string, @Body() dto: VehicleDto) {
    return this.prisma.vehicle.update({ where: { id }, data: dto });
  }

  @Delete('vehicles/:id')
  @HttpCode(204)
  async deleteVehicle(@Param('id') id: string) {
    const media = await this.prisma.vehicleMedia.findMany({ where: { vehicleId: id }, select: { id: true } });
    for (const m of media) await this.media.remove(m.id);
    await this.prisma.vehicle.delete({ where: { id } });
    await this.prisma.siteSettings.updateMany({ where: { heroVehicleId: id }, data: { heroVehicleId: null } });
    await this.prisma.siteSettings.updateMany({ where: { featuredVehicleId: id }, data: { featuredVehicleId: null } });
  }

  // --- Catégories
  @Get('categories')
  categories() {
    return this.prisma.vehicleCategory.findMany({ orderBy: { position: 'asc' }, include: { _count: { select: { vehicles: true } } } });
  }
  @Post('categories')
  createCategory(@Body() dto: CategoryDto) {
    return this.prisma.vehicleCategory.create({ data: dto });
  }
  @Put('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.prisma.vehicleCategory.update({ where: { id }, data: dto });
  }
  @Delete('categories/:id')
  @HttpCode(204)
  async deleteCategory(@Param('id') id: string) {
    if (await this.prisma.vehicle.count({ where: { categoryId: id } })) throw new BadRequestException('Cette catégorie contient encore des véhicules');
    await this.prisma.vehicleCategory.delete({ where: { id } });
  }

  // --- Versions, caractéristiques, coloris
  @Post('vehicles/:id/versions')
  addVersion(@Param('id') vehicleId: string, @Body() dto: VersionDto) {
    return this.prisma.vehicleVersion.create({ data: { ...dto, vehicleId } });
  }
  @Put('versions/:id')
  updateVersion(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.prisma.vehicleVersion.update({ where: { id }, data: dto });
  }
  @Delete('versions/:id')
  @HttpCode(204)
  async deleteVersion(@Param('id') id: string) {
    await this.prisma.vehicleVersion.delete({ where: { id } });
  }

  @Post('vehicles/:id/specifications')
  addSpec(@Param('id') vehicleId: string, @Body() dto: SpecDto) {
    return this.prisma.vehicleSpecification.create({ data: { ...dto, vehicleId } });
  }
  @Put('specifications/:id')
  updateSpec(@Param('id') id: string, @Body() dto: SpecDto) {
    return this.prisma.vehicleSpecification.update({ where: { id }, data: dto });
  }
  @Delete('specifications/:id')
  @HttpCode(204)
  async deleteSpec(@Param('id') id: string) {
    await this.prisma.vehicleSpecification.delete({ where: { id } });
  }

  @Post('vehicles/:id/colors')
  addColor(@Param('id') vehicleId: string, @Body() dto: ColorDto) {
    return this.prisma.vehicleColor.create({ data: { ...dto, vehicleId } });
  }
  @Put('colors/:id')
  updateColor(@Param('id') id: string, @Body() dto: ColorDto) {
    return this.prisma.vehicleColor.update({ where: { id }, data: dto });
  }
  @Delete('colors/:id')
  @HttpCode(204)
  async deleteColor(@Param('id') id: string) {
    await this.prisma.vehicleColor.delete({ where: { id } });
  }

  // --- Médias
  @Post('vehicles/:id/media')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Téléverse un média : format vérifié d’après le contenu, variantes WebP générées côté serveur' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: Math.max(...Object.values(LIMITS)), files: 1 } }))
  async upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadMediaDto) {
    if (!file) throw new BadRequestException('Fichier manquant');
    if (!(await this.prisma.vehicle.count({ where: { id } }))) throw new NotFoundException();
    const { kind, ...meta } = dto;
    return this.media.present(await this.media.ingest(id, kind, file.buffer, meta));
  }

  @Post('media/:id/cutout')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ajoute la version détourée d’une photographie (fond transparent)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITS.IMAGE, files: 1 } }))
  async cutout(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Fichier manquant');
    return this.media.present(await this.media.attachCutout(id, file.buffer));
  }

  @Patch('media/:id')
  updateMedia(@Param('id') id: string, @Body() dto: UpdateMediaDto) {
    return this.prisma.vehicleMedia.update({ where: { id }, data: dto }).then((m) => this.media.present(m));
  }
  @Post('media/:id/primary')
  @HttpCode(204)
  async primary(@Param('id') id: string) {
    await this.media.setPrimary(id);
  }
  @Delete('media/:id')
  @HttpCode(204)
  async deleteMedia(@Param('id') id: string) {
    await this.media.remove(id);
  }
  @Put('vehicles/:id/media/order')
  @HttpCode(204)
  async reorder(@Param('id') id: string, @Body() dto: ReorderDto) {
    await this.media.reorder(id, dto.ids);
  }

  // --- Page d'accueil et coordonnées
  @Get('settings')
  settings() {
    return this.prisma.siteSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }
  @Put('settings')
  saveSettings(@Body() dto: SettingsDto) {
    return this.prisma.siteSettings.upsert({ where: { id: 1 }, update: dto, create: { id: 1, ...dto } });
  }

  // --- Demandes
  @Get('requests')
  requests() {
    return this.prisma.contactRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 300, include: { vehicle: { select: { name: true, slug: true } } } });
  }
  @Patch('requests/:id')
  updateRequest(@Param('id') id: string, @Body() dto: RequestStatusDto) {
    return this.prisma.contactRequest.update({ where: { id }, data: dto });
  }
  @Delete('requests/:id')
  @HttpCode(204)
  async deleteRequest(@Param('id') id: string) {
    await this.prisma.contactRequest.delete({ where: { id } });
  }
}
