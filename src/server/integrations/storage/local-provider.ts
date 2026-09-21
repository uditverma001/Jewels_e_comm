import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { PresignedUpload, StorageProvider } from './types';

/**
 * Development driver: writes into `public/uploads` through a local route
 * handler that mimics the presigned PUT contract.
 *
 * It exists so `pnpm dev` works with no cloud account. `src/env.ts` refuses to
 * boot production with this driver, because the directory is ephemeral.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root = path.join(process.cwd(), 'public', 'uploads');

  constructor(private readonly appUrl: string) {}

  async createPresignedUpload(params: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<PresignedUpload> {
    await mkdir(path.join(this.root, path.dirname(params.key)), { recursive: true });
    return {
      uploadUrl: `${this.appUrl.replace(/\/$/, '')}/api/admin/media/local-upload?key=${encodeURIComponent(params.key)}`,
      publicUrl: this.publicUrl(params.key),
      key: params.key,
      headers: { 'Content-Type': params.contentType },
    };
  }

  async delete(key: string): Promise<void> {
    await rm(path.join(this.root, key), { force: true });
  }

  publicUrl(key: string): string {
    return `/uploads/${key}`;
  }
}
