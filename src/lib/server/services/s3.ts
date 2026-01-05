import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env, isS3Enabled } from '../env';
import { randomUUID } from 'node:crypto';

// Lazy initialization - only create S3 client if credentials are provided
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!isS3Enabled()) {
    throw new Error(
      'S3 is not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file. ' +
      'File uploads are disabled in development mode without S3 credentials.'
    );
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  return s3Client;
}

export interface UploadResult {
  url: string;
  key: string;
  mimeType: string;
  size: number;
}

/**
 * Upload a file to S3
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
    ACL: 'public-read',
  });

  await client.send(command);

  const url = `${env.S3_PUBLIC_URL}/${key}`;

  return {
    url,
    key,
    mimeType,
    size: file.length,
  };
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
