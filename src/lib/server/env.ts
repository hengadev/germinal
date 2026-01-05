import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AWS_REGION: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET_NAME: z.string(),
  S3_PUBLIC_URL: z.string().url(),
  MAX_FILE_SIZE: z.string().transform(Number),
  ALLOWED_IMAGE_TYPES: z.string().transform(s => s.split(',')),
  ALLOWED_VIDEO_TYPES: z.string().transform(s => s.split(',')),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
}

export const env = validateEnv();
