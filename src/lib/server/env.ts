import { z } from 'zod';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Development schema - only DATABASE_URL required
const devEnvSchema = z.object({
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/germinal'),
    USE_MOCK_DATA: z.string().default('false').transform(v => v === 'true'),
    MOCK_ADMIN_EMAIL: z.string().default('admin@germinal.com'),
    MOCK_ADMIN_PASSWORD: z.string().default('admin123'),
    AWS_REGION: z.string().optional().default('us-east-1'),
    AWS_ACCESS_KEY_ID: z.string().optional().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
    S3_BUCKET_NAME: z.string().optional().default('germinal-media-dev'),
    S3_PUBLIC_URL: z.string().optional().default('http://localhost:9000'),
    MAX_FILE_SIZE: z.string().default('10485760').transform(Number),
    ALLOWED_IMAGE_TYPES: z.string().default('image/jpeg,image/png,image/webp,image/gif').transform(s => s.split(',')),
    ALLOWED_VIDEO_TYPES: z.string().default('video/mp4,video/webm,video/quicktime').transform(s => s.split(',')),
});

// Production schema - all fields required
const prodEnvSchema = z.object({
    DATABASE_URL: z.string().url(),
    USE_MOCK_DATA: z.string().default('false').transform(v => v === 'true'),
    MOCK_ADMIN_EMAIL: z.string().default('admin@germinal.com'),
    MOCK_ADMIN_PASSWORD: z.string().default('admin123'),
    AWS_REGION: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET_NAME: z.string().min(1),
    S3_PUBLIC_URL: z.string().url(),
    MAX_FILE_SIZE: z.string().transform(Number),
    ALLOWED_IMAGE_TYPES: z.string().transform(s => s.split(',')),
    ALLOWED_VIDEO_TYPES: z.string().transform(s => s.split(',')),
});

function validateEnv() {
    const schema = isDevelopment ? devEnvSchema : prodEnvSchema;
    const parsed = schema.safeParse(process.env);

    if (!parsed.success) {
        console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);

        if (!isDevelopment) {
            throw new Error('Invalid environment variables in production');
        }

        console.warn('⚠️  Using default values for development. Some features may not work.');
    }

    const data = parsed.success ? parsed.data : schema.parse({});

    if (isDevelopment) {
        console.log('🔧 Development mode - using environment:', {
            DATABASE_URL: data.DATABASE_URL.replace(/:[^:]*@/, ':***@'), // Hide password
            S3_ENABLED: !!(data.AWS_ACCESS_KEY_ID && data.AWS_SECRET_ACCESS_KEY),
        });
    }

    return data;
}

export const env = validateEnv();

// Helper to check if S3 is configured
export const isS3Enabled = () => {
    return !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
};
