import { S3Client, PutObjectCommand, DeleteObjectCommand, type S3ClientConfig } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { env, getS3Credentials, getMediaBaseUrl } from '../env';

/**
 * Client config: real AWS S3 by default; any S3-compatible endpoint (local
 * MinIO) when S3_ENDPOINT is set, addressed path-style (endpoint/bucket/key).
 */
export function getS3ClientConfig(): S3ClientConfig {
  const credentials = getS3Credentials();
  if (!credentials) {
    throw new Error(
      'S3 is not configured. Please set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (or AWS_ACCESS_KEY_ID and ' +
      'AWS_SECRET_ACCESS_KEY) in your .env file. File uploads are disabled in development mode without S3 credentials.'
    );
  }

  return {
    region: env.AWS_REGION,
    credentials,
    ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT, forcePathStyle: true }),
  };
}

// Lazy initialization - only create S3 client if credentials are provided
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client(getS3ClientConfig());
  }

  return s3Client;
}

export interface UploadStreamResult {
  url: string;
  key: string;
}

export interface UploadResult {
  url: string;
  key: string;
  mimeType: string;
  size: number;
}

/**
 * Upload a stream to S3
 * @param key - S3 object key
 * @param stream - ReadableStream of the file
 * @param contentType - MIME type
 * @param fileSize - File size in bytes
 * @returns Upload result with URL
 */
export async function uploadStreamToS3(
  key: string,
  stream: ReadableStream<Uint8Array>,
  contentType: string,
  fileSize: number
): Promise<UploadStreamResult> {
  const client = getS3Client();

  // Convert WHATWG ReadableStream to Node.js Readable — recent AWS SDK v3 versions
  // fail to calculate checksums on WHATWG streams ("flowing readable stream" error).
  const body = Readable.fromWeb(stream as import('stream/web').ReadableStream);

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentLength: fileSize,
  });

  await client.send(command);

  const url = `${getMediaBaseUrl()}/${key}`;

  return { url, key };
}

/**
 * Upload a buffer to S3
 * @param file - File buffer
 * @param mimeType - MIME type of the file
 * @param folder - S3 folder (events/talents)
 * @returns Upload result with URL and metadata
 */
export async function uploadToS3(
  file: Buffer,
  mimeType: string,
  folder: 'events' | 'talents'
): Promise<UploadResult> {
  const client = getS3Client();

  const fileExtension = getExtensionFromMimeType(mimeType);
  const fileName = `${randomUUID()}${fileExtension}`;
  const key = `${folder}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: mimeType,
  });

  await client.send(command);

  const url = `${getMediaBaseUrl()}/${key}`;

  return {
    url,
    key,
    mimeType,
    size: file.length,
  };
}

/**
 * Upload multiple files to S3
 * @param files - Array of file buffers with metadata
 * @param folder - S3 folder
 * @returns Array of upload results
 */
export async function uploadMultipleToS3(
  files: Array<{ buffer: Buffer; mimeType: string }>,
  folder: 'events' | 'talents'
): Promise<UploadResult[]> {
  return Promise.all(
    files.map(file => uploadToS3(file.buffer, file.mimeType, folder))
  );
}

/**
 * Delete a file from S3
 * @param key - S3 object key
 */
export async function deleteFromS3(key: string): Promise<void> {
  const client = getS3Client();

  const command = new DeleteObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });

  await client.send(command);
}

/**
 * Delete multiple files from S3
 * @param keys - Array of S3 object keys
 */
export async function deleteMultipleFromS3(keys: string[]): Promise<void> {
  const client = getS3Client();

  await Promise.all(
    keys.map(key =>
      client.send(new DeleteObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
      }))
    )
  );
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };

  return map[mimeType] || '';
}
