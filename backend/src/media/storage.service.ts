import { Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Stockage objet : S3 compatible si S3_ENDPOINT est défini, sinon dossier local (développement). */
@Injectable()
export class StorageService {
  private readonly localRoot = resolve(process.env.STORAGE_DIR ?? 'storage');
  private readonly s3 = process.env.S3_ENDPOINT
    ? new AwsClient({
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
        region: process.env.S3_REGION ?? 'auto',
        service: 's3',
      })
    : null;

  get localDirectory() {
    return this.s3 ? null : this.localRoot;
  }

  /** URL publique renvoyée au site. Le secret S3 ne quitte jamais le serveur. */
  publicUrl(key: string) {
    if (this.s3) return `${process.env.S3_PUBLIC_URL}/${key}`;
    return `/media/${key}`;
  }

  async put(key: string, body: Buffer, contentType: string) {
    if (this.s3) {
      const res = await this.s3.fetch(this.objectUrl(key), {
        method: 'PUT',
        body: new Uint8Array(body),
        headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
      });
      if (!res.ok) throw new Error(`S3 PUT ${res.status}`);
      return;
    }
    const path = join(this.localRoot, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async delete(key: string) {
    if (this.s3) {
      const res = await this.s3.fetch(this.objectUrl(key), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${res.status}`);
      return;
    }
    await rm(join(this.localRoot, key), { force: true });
  }

  private objectUrl(key: string) {
    return `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`;
  }
}
