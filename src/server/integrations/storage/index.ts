import 'server-only';
import { randomUUID } from 'node:crypto';
import { env } from '@/env';
import { validationError } from '@/server/errors';
import { LocalStorageProvider } from './local-provider';
import { S3StorageProvider } from './s3-provider';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  type PresignedUpload,
  type StorageProvider,
} from './types';

export * from './types';

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  provider =
    env.STORAGE_DRIVER === 's3'
      ? new S3StorageProvider({
          bucket: env.S3_BUCKET ?? '',
          region: env.S3_REGION,
          endpoint: env.S3_ENDPOINT || undefined,
          accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
          publicBaseUrl: env.S3_PUBLIC_URL ?? '',
        })
      : new LocalStorageProvider(env.APP_URL);
  return provider;
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/**
 * Validate an upload request and mint a server-controlled object key.
 *
 * The client supplies only a content type and a size; it never supplies a path.
 * That is what stops an admin-panel compromise from writing over
 * `index.html` or escaping the prefix with `../`.
 */
export async function requestMediaUpload(params: {
  contentType: string;
  contentLength: number;
  prefix: 'products' | 'categories' | 'collections' | 'brands';
}): Promise<PresignedUpload> {
  const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(params.contentType);
  const isVideo = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(params.contentType);

  if (!isImage && !isVideo) {
    throw validationError(`Unsupported file type: ${params.contentType}`);
  }
  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isInteger(params.contentLength) || params.contentLength <= 0) {
    throw validationError('A valid file size is required.');
  }
  if (params.contentLength > maxBytes) {
    throw validationError(`Files must be under ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }

  const extension = EXTENSION_BY_TYPE[params.contentType] ?? 'bin';
  const key = `${params.prefix}/${new Date().getFullYear()}/${randomUUID()}.${extension}`;

  return getStorageProvider().createPresignedUpload({
    key,
    contentType: params.contentType,
    contentLength: params.contentLength,
  });
}

export function __setStorageProvider(next: StorageProvider | null): void {
  provider = next;
}
