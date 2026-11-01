import { BadRequestException, Injectable } from '@nestjs/common';
import { MediaKind, MediaView } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import sharp, { Metadata, Sharp } from 'sharp';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from './storage.service';

export const IMAGE_WIDTHS = [480, 720, 1080, 1600, 2560];
export const LIMITS = { IMAGE: 40 * 1024 * 1024, SPIN_FRAME: 15 * 1024 * 1024, VIDEO: 200 * 1024 * 1024, MODEL_3D: 80 * 1024 * 1024 };

type Meta = {
  view?: MediaView;
  alt?: string;
  colorId?: string | null;
  credit?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
};

function isMp4OrWebm(b: Buffer) {
  const mp4 = b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp';
  const webm = b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3;
  return mp4 ? 'video/mp4' : webm ? 'video/webm' : null;
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  /** Le format est établi d'après le contenu du fichier : ni l'extension ni le type annoncé ne font foi. */
  async ingest(vehicleId: string, kind: MediaKind, buffer: Buffer, meta: Meta) {
    if (buffer.length > LIMITS[kind]) throw new BadRequestException('Fichier trop volumineux');
    const base = `vehicles/${vehicleId}/${randomUUID()}`;
    const last = await this.prisma.vehicleMedia.aggregate({ where: { vehicleId, kind }, _max: { position: true } });
    const position = (last._max.position ?? -1) + 1;
    const stored = kind === 'IMAGE' || kind === 'SPIN_FRAME'
      ? await this.storeImage(base, buffer, kind)
      : kind === 'VIDEO' ? await this.storeVideo(base, buffer) : await this.storeModel(base, buffer);
    const hasPrimary = kind === 'IMAGE' && (await this.prisma.vehicleMedia.count({ where: { vehicleId, kind, isPrimary: true } })) > 0;
    return this.prisma.vehicleMedia.create({
      data: {
        vehicleId, kind, position, view: meta.view ?? 'OTHER', alt: meta.alt ?? '', colorId: meta.colorId ?? null,
        credit: meta.credit, license: meta.license, licenseUrl: meta.licenseUrl, sourceUrl: meta.sourceUrl,
        isPrimary: kind === 'IMAGE' && !hasPrimary, bytes: buffer.length, ...stored,
      },
    });
  }

  private async storeImage(base: string, buffer: Buffer, kind: MediaKind) {
    let image: Sharp;
    let info: Metadata;
    try {
      image = sharp(buffer, { limitInputPixels: 120_000_000 }).rotate();
      info = await image.metadata();
    } catch {
      throw new BadRequestException('Image illisible ou format non pris en charge');
    }
    if (!info.format || !['jpeg', 'png', 'webp', 'avif', 'tiff'].includes(info.format)) {
      throw new BadRequestException('Formats acceptés : JPEG, PNG, WebP, AVIF, TIFF');
    }
    const swapped = (info.orientation ?? 1) >= 5;
    const width = swapped ? info.height! : info.width!;
    const height = swapped ? info.width! : info.height!;
    if (kind === 'IMAGE' && width < 1200) throw new BadRequestException('Largeur minimale : 1200 pixels');
    const widths = kind === 'SPIN_FRAME' ? [960, 1600] : IMAGE_WIDTHS;
    const targets = [...new Set([...widths.filter((w) => w < width), Math.min(width, widths[widths.length - 1])])];
    const files: Record<string, string> = {};
    for (const w of targets) {
      const out = await image.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: w >= 1600 ? 82 : 70, effort: 5 }).toBuffer();
      const key = `${base}/${w}.webp`;
      await this.storage.put(key, out, 'image/webp');
      files[String(w)] = key;
    }
    const { dominant } = await image.clone().resize(64).stats();
    const dominantColor = `#${[dominant.r, dominant.g, dominant.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    return { files, width, height, dominantColor };
  }

  private async storeVideo(base: string, buffer: Buffer) {
    const type = isMp4OrWebm(buffer);
    if (!type) throw new BadRequestException('Formats vidéo acceptés : MP4, WebM');
    const key = `${base}/video.${type === 'video/mp4' ? 'mp4' : 'webm'}`;
    await this.storage.put(key, buffer, type);
    return { files: { original: key } };
  }

  private async storeModel(base: string, buffer: Buffer) {
    if (buffer.length < 12 || buffer.subarray(0, 4).toString('latin1') !== 'glTF' || buffer.readUInt32LE(4) !== 2) {
      throw new BadRequestException('Format 3D accepté : GLB (glTF 2.0 binaire)');
    }
    const key = `${base}/model.glb`;
    await this.storage.put(key, buffer, 'model/gltf-binary');
    return { files: { original: key } };
  }

  async remove(id: string) {
    const media = await this.prisma.vehicleMedia.delete({ where: { id } });
    const keys = [...Object.values(media.files as Record<string, string>), ...Object.values((media.cutoutFiles ?? {}) as Record<string, string>)];
    await Promise.all(keys.map((key) => this.storage.delete(key)));
    if (media.isPrimary) {
      const next = await this.prisma.vehicleMedia.findFirst({ where: { vehicleId: media.vehicleId, kind: 'IMAGE' }, orderBy: { position: 'asc' } });
      if (next) await this.prisma.vehicleMedia.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }

  /** Version détourée d'une photographie : fond transparent obligatoire, vérifié sur le fichier. */
  async attachCutout(id: string, buffer: Buffer) {
    if (buffer.length > LIMITS.IMAGE) throw new BadRequestException('Fichier trop volumineux');
    const media = await this.prisma.vehicleMedia.findUniqueOrThrow({ where: { id } });
    if (media.kind !== 'IMAGE') throw new BadRequestException('Seule une photographie peut être détourée');
    let hasAlpha = false;
    try {
      hasAlpha = Boolean((await sharp(buffer, { limitInputPixels: 120_000_000 }).metadata()).hasAlpha);
    } catch {
      throw new BadRequestException('Image illisible');
    }
    if (!hasAlpha) throw new BadRequestException('Le détourage doit avoir un fond transparent (PNG ou WebP)');
    const stored = await this.storeImage(`vehicles/${media.vehicleId}/${randomUUID()}`, buffer, 'IMAGE');
    await Promise.all(Object.values((media.cutoutFiles ?? {}) as Record<string, string>).map((key) => this.storage.delete(key)));
    return this.prisma.vehicleMedia.update({ where: { id }, data: { cutoutFiles: stored.files, cutoutWidth: stored.width, cutoutHeight: stored.height } });
  }

  async setPrimary(id: string) {
    const media = await this.prisma.vehicleMedia.findUniqueOrThrow({ where: { id } });
    if (media.kind !== 'IMAGE') throw new BadRequestException('Seule une photographie peut être principale');
    await this.prisma.$transaction([
      this.prisma.vehicleMedia.updateMany({ where: { vehicleId: media.vehicleId }, data: { isPrimary: false } }),
      this.prisma.vehicleMedia.update({ where: { id }, data: { isPrimary: true } }),
    ]);
  }

  async reorder(vehicleId: string, ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.vehicleMedia.updateMany({ where: { id, vehicleId }, data: { position } })),
    );
  }

  /** Forme publique d'un média : URLs uniquement, jamais de clé de stockage interne. */
  present<T extends { files: unknown; cutoutFiles?: unknown }>(media: T) {
    const { files, cutoutFiles, ...rest } = media;
    const urls = (map: unknown) => Object.entries((map ?? {}) as Record<string, string>).map(([size, key]) => ({ size, url: this.storage.publicUrl(key) }));
    return { ...rest, sources: urls(files), cutoutSources: urls(cutoutFiles) };
  }
}
