import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignedUpload, StorageProvider } from './types';

/**
 * S3-compatible storage (AWS S3, Cloudflare R2, MinIO).
 *
 * Uploads are presigned so image bytes never pass through the app server —
 * that keeps memory flat and upload latency off the Node event loop.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor(
    private readonly config: {
      bucket: string;
      region: string;
      endpoint?: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl: string;
    },
  ) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createPresignedUpload(params: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: params.key,
      ContentType: params.contentType,
      // Signing the length prevents a client from using the URL to upload
      // something far larger than it declared.
      ContentLength: params.contentLength,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 300 });

    return {
      uploadUrl,
      publicUrl: this.publicUrl(params.key),
      key: params.key,
      headers: {
        'Content-Type': params.contentType,
        'Content-Length': String(params.contentLength),
      },
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
}
