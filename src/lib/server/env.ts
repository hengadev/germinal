import 'dotenv/config';
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
    // SMTP Configuration - optional in dev, will log to console if not configured
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.string().optional().default('587').transform(Number),
    SMTP_SECURE: z.string().optional().default('false').transform(v => v === 'true'),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
    SMTP_FROM_EMAIL: z.string().email().optional().default('noreply@germinal.com'),
    SMTP_FROM_NAME: z.string().optional().default('Germinal'),
    CONTACT_EMAIL: z.string().email().optional().default('hello@germinal.com'),
    // Stripe Configuration - optional in dev
    STRIPE_SECRET_KEY: z.string().optional().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
    PUBLIC_URL: z.string().url().optional().default('http://localhost:5173'),
    RESERVATION_EXPIRY_MINUTES: z.string().optional().default('15').transform(Number),
    // Sentry monitoring - optional
    SENTRY_DSN: z.string().optional().default(''),
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
    // SMTP Configuration - required in production
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.string().transform(Number),
    SMTP_SECURE: z.string().transform(v => v === 'true'),
    SMTP_USER: z.string().min(1),
    SMTP_PASSWORD: z.string().min(1),
    SMTP_FROM_EMAIL: z.string().email(),
    SMTP_FROM_NAME: z.string().min(1),
    CONTACT_EMAIL: z.string().email(),
    // Stripe Configuration - required in production for reservations
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    PUBLIC_URL: z.string().url(),
    RESERVATION_EXPIRY_MINUTES: z.string().optional().default('15').transform(Number),
    // Sentry monitoring - optional but recommended in production
    SENTRY_DSN: z.string().optional(),
});

// Check if we're in build mode (SvelteKit runs this during build for analysis)
const isBuildTime = process.env.npm_lifecycle_event === 'build' ||
                    process.argv.some(arg => arg.includes('vite build'));

// Check if mock data mode is enabled (allows relaxed env requirements)
const useMockData = process.env.USE_MOCK_DATA === 'true';

function validateEnv() {
    // Skip validation during build - env vars will be validated at runtime
    if (isBuildTime) {
        console.log('🔨 Build mode detected - skipping env validation');
        // Return dummy values for build
        return devEnvSchema.parse({});
    }

    // Use dev schema (relaxed) when mock data is enabled, even in production
    const useRelaxedSchema = isDevelopment || useMockData;
    const schema = useRelaxedSchema ? devEnvSchema : prodEnvSchema;
    const parsed = schema.safeParse(process.env);

    if (!parsed.success) {
        console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);

        if (!useRelaxedSchema) {
            throw new Error('Invalid environment variables in production');
        }

        console.warn('⚠️  Using default values for development. Some features may not work.');
    }

    const data = parsed.success ? parsed.data : schema.parse({});

    if (useMockData) {
        console.log('📦 Mock data mode enabled - no database needed!');
        console.log('   To use real database, set DATABASE_URL in .env');
    } else if (isDevelopment) {
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

// Helper to check if SMTP is configured
export const isSMTPEnabled = () => {
    return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
};

// Helper to check if Stripe is configured
export const isStripeEnabled = () => {
    return !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
};
