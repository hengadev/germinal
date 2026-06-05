import 'dotenv/config';
import { z } from 'zod';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Development schema - only DATABASE_URL required
const devEnvSchema = z.object({
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/germinal'),
    USE_MOCK_DATA: z.string().default('false').transform(v => v === 'true'),
    MOCK_ADMIN_EMAIL: z.string().optional().default(''),
    MOCK_ADMIN_PASSWORD: z.string().optional().default(''),
    MOCK_STAFF_EMAIL: z.string().optional().default(''),
    MOCK_STAFF_PASSWORD: z.string().optional().default(''),
    AWS_REGION: z.string().optional().default('us-east-1'),
    AWS_ACCESS_KEY_ID: z.string().optional().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
    S3_BUCKET_NAME: z.string().optional().default('germinal-media-dev'),
    S3_PUBLIC_URL: z.string().optional().default('http://localhost:9000'),
    MEDIA_URL: z.string().url().optional(), // CloudFront URL, falls back to S3_PUBLIC_URL
    MAX_FILE_SIZE: z.string().default('10485760').transform(Number),
    ALLOWED_IMAGE_TYPES: z.string().default('image/jpeg,image/png,image/webp,image/gif').transform(s => s.split(',')),
    ALLOWED_VIDEO_TYPES: z.string().default('video/mp4,video/webm,video/quicktime').transform(s => s.split(',')),
    // Email Configuration - uses SES API for sending, sender info used for From address
    // SMTP_* vars are legacy, only SMTP_FROM_* are actively used
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
    USE_SCHEDULER: z.string().optional().default('false').transform(v => v === 'true'),
    // Cron security
    CRON_SECRET: z.string().optional().default('change-me-in-production'),
    // Twilio SMS - optional
    TWILIO_ACCOUNT_SID: z.string().optional().default(''),
    TWILIO_API_KEY_SID: z.string().optional().default(''),
    TWILIO_API_KEY_SECRET: z.string().optional().default(''),
    TWILIO_PHONE_NUMBER: z.string().optional().default(''),
});

// Production schema - all fields required
const prodEnvSchema = z.object({
    DATABASE_URL: z.string().url(),
    USE_MOCK_DATA: z.string().default('false').transform(v => v === 'true'),
    MOCK_ADMIN_EMAIL: z.string().optional().default(''),
    MOCK_ADMIN_PASSWORD: z.string().optional().default(''),
    MOCK_STAFF_EMAIL: z.string().optional().default(''),
    MOCK_STAFF_PASSWORD: z.string().optional().default(''),
    AWS_REGION: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET_NAME: z.string().min(1),
    S3_PUBLIC_URL: z.string().url(),
    MEDIA_URL: z.string().url().optional(), // CloudFront URL, falls back to S3_PUBLIC_URL
    MAX_FILE_SIZE: z.string().transform(Number),
    ALLOWED_IMAGE_TYPES: z.string().transform(s => s.split(',')),
    ALLOWED_VIDEO_TYPES: z.string().transform(s => s.split(',')),
    // Email Configuration - SES API is used for sending, only sender info required
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.string().optional().default('587').transform(Number),
    SMTP_SECURE: z.string().optional().default('false').transform(v => v === 'true'),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
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
    USE_SCHEDULER: z.string().optional().default('false').transform(v => v === 'true'),
    // Cron security - required in production
    CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),
    // Twilio SMS - optional in production
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_API_KEY_SID: z.string().optional(),
    TWILIO_API_KEY_SECRET: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),
});

// Check if we're in build mode (SvelteKit runs this during build for analysis)
const isBuildTime = process.env.npm_lifecycle_event === 'build' ||
                    process.argv.some(arg => arg.includes('vite build'));

// Check if mock data mode is enabled (allows relaxed env requirements)
const useMockData = process.env.USE_MOCK_DATA === 'true';

// Use console during bootstrap to avoid circular dependency with logger
const bootstrapLog = {
    info: (...args: unknown[]) => console.log(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args),
};

function validateEnv() {
    // Skip validation during build - env vars will be validated at runtime
    if (isBuildTime) {
        bootstrapLog.info('🔨 Build mode detected - skipping env validation');
        // Return dummy values for build
        return devEnvSchema.parse({});
    }

    // Use dev schema (relaxed) when mock data is enabled, even in production
    const useRelaxedSchema = isDevelopment || useMockData;
    const schema = useRelaxedSchema ? devEnvSchema : prodEnvSchema;
    const parsed = schema.safeParse(process.env);

    if (!parsed.success) {
        bootstrapLog.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);

        if (!useRelaxedSchema) {
            throw new Error('Invalid environment variables in production');
        }

        bootstrapLog.warn('⚠️  Using default values for development. Some features may not work.');
    }

    const data = parsed.success ? parsed.data : schema.parse({});

    if (useMockData) {
        // Validate mock admin credentials when mock data is enabled
        if (!data.MOCK_ADMIN_EMAIL || data.MOCK_ADMIN_EMAIL.includes('germinal.com')) {
            bootstrapLog.error('');
            bootstrapLog.error('❌ MOCK_ADMIN_EMAIL is required when USE_MOCK_DATA=true');
            bootstrapLog.error('   Must not contain "germinal.com"');
            bootstrapLog.error('');
            bootstrapLog.error('To set mock admin credentials:');
            bootstrapLog.error('  1. Add to .env file:');
            bootstrapLog.error('     MOCK_ADMIN_EMAIL=your@email.com');
            bootstrapLog.error('     MOCK_ADMIN_PASSWORD=yourpassword');
            bootstrapLog.error('');
            throw new Error('MOCK_ADMIN_EMAIL is required when USE_MOCK_DATA=true');
        }
        if (!data.MOCK_ADMIN_PASSWORD || data.MOCK_ADMIN_PASSWORD.length < 8) {
            bootstrapLog.error('❌ MOCK_ADMIN_PASSWORD must be at least 8 characters when USE_MOCK_DATA=true');
            throw new Error('MOCK_ADMIN_PASSWORD is required when USE_MOCK_DATA=true');
        }
        bootstrapLog.info('📦 Mock data mode enabled - no database needed!');
        bootstrapLog.info('   To use real database, set DATABASE_URL in .env');
    } else if (isDevelopment) {
        bootstrapLog.info('🔧 Development mode - using environment:', {
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
// DEPRECATED: Use isAWSConfigured for SES API email sending
export const isSMTPEnabled = () => {
    return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
};

// Helper to check if AWS is configured (for SES API email sending)
export const isAWSConfigured = () => {
    return !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_REGION);
};

// Helper to check if Stripe is configured
export const isStripeEnabled = () => {
    return !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
};

// Helper to get media base URL (CloudFront if configured, otherwise S3)
export const getMediaBaseUrl = () => {
    return env.MEDIA_URL || env.S3_PUBLIC_URL;
};

/**
 * Application configuration
 * Centralizes all magic numbers and configurable values
 * All values are validated on startup
 */
export const config = {
    // Job intervals (in milliseconds)
    jobs: {
        sessionCleanupIntervalMs: 60 * 60 * 1000, // 1 hour
        reservationCleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
        emailQueueIntervalMs: 2 * 60 * 1000, // 2 minutes
    },

    // Reservation settings
    reservations: {
        maxTicketsPerReservation: 10,
        expiryMinutes: env.RESERVATION_EXPIRY_MINUTES,
        holdTimeWarningMinutes: 5, // Show warning when 5 min left
    },

    // Rate limiting
    rateLimit: {
        reservationWindowMs: 10 * 60 * 1000, // 10 minutes
        reservationMaxAttempts: 10,
        contactFormWindowMs: 60 * 60 * 1000, // 1 hour
        contactFormMaxAttempts: 5,
    },

    // Email queue settings
    email: {
        maxRetryAttempts: 3,
        retryBaseDelayMinutes: 5,
        batchSize: 10, // Process up to 10 emails at a time
    },

    // Payment settings
    payment: {
        supportedCurrencies: ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'] as const,
    },

    // Database settings
    database: {
        statementTimeoutSeconds: 10,
        maxConnections: 10,
        connectionTimeoutSeconds: 10,
        idleTimeoutSeconds: 20,
        slowQueryThresholdMs: 100, // Log queries slower than 100ms
    },

    // Event sessions
    eventSessions: {
        minCapacity: 1,
        maxCapacity: 10000,
    },

    // Health check thresholds
    health: {
        databaseLatencyWarningMs: 500, // Warn if DB queries take >500ms
        databaseLatencyCriticalMs: 1000, // Critical if DB queries take >1s
    },
} as const;

/**
 * Type-safe config access
 */
export type AppConfig = typeof config;

/**
 * Validate configuration on startup
 * This function is called once when the application starts
 */
export function validateConfig() {
    const errors: string[] = [];

    // Validate reservation expiry
    if (env.RESERVATION_EXPIRY_MINUTES < 1) {
        errors.push('RESERVATION_EXPIRY_MINUTES must be at least 1');
    }

    if (env.RESERVATION_EXPIRY_MINUTES > 1440) {
        errors.push('RESERVATION_EXPIRY_MINUTES must be less than 1440 (24 hours)');
    }

    // Validate file size
    if (env.MAX_FILE_SIZE < 1024) {
        errors.push('MAX_FILE_SIZE must be at least 1024 bytes (1KB)');
    }

    if (env.MAX_FILE_SIZE > 104857600) {
        errors.push('MAX_FILE_SIZE must be less than 100MB');
    }

    // Validate database connection string
    if (!env.USE_MOCK_DATA) {
        if (!env.DATABASE_URL || !env.DATABASE_URL.startsWith('postgresql://') && !env.DATABASE_URL.startsWith('postgres://')) {
            errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
        }
    }

    // Validate SMTP configuration (only if not in dev mode)
    // Note: Email sending now uses SES API, but SMTP_FROM_* vars are still used for sender info
    if (!isDevelopment) {
        if (!env.SMTP_FROM_EMAIL || !env.SMTP_FROM_NAME) {
            errors.push('Email sender configuration is required in production (SMTP_FROM_EMAIL, SMTP_FROM_NAME)');
        }
        if (!isAWSConfigured()) {
            errors.push('AWS configuration is required in production for email sending via SES (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)');
        }
    }

    // Validate Stripe configuration (only if not in dev mode)
    if (!isDevelopment && !isStripeEnabled()) {
        errors.push('Stripe configuration is required in production (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)');
    }

    // Validate S3 configuration (only if not in dev mode)
    if (!isDevelopment && !isS3Enabled()) {
        errors.push('S3 configuration is required in production (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME)');
    }

    if (errors.length > 0) {
        bootstrapLog.error('❌ Configuration validation failed:');
        errors.forEach(error => bootstrapLog.error(`   - ${error}`));
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    bootstrapLog.info('✅ Configuration validated successfully');
}
