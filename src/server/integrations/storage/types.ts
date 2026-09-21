export interface PresignedUpload {
  /** Where the browser PUTs the bytes. */
  uploadUrl: string;
  /** Where the object will be publicly readable once uploaded. */
  publicUrl: string;
  /** Server-generated object key. The client never chooses this. */
  key: string;
  /** Headers the client must send with the PUT. */
  headers: Record<string, string>;
}

export interface StorageProvider {
  readonly name: string;
  createPresignedUpload(params: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<PresignedUpload>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
