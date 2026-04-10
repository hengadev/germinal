CREATE TYPE "public"."inquiry_type" AS ENUM('collaboration', 'new_project', 'join_roster', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."notification_preference" AS ENUM('email', 'sms', 'both');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'processing', 'confirmed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"company" varchar(255),
	"inquiry_type" "inquiry_type" NOT NULL,
	"message" text NOT NULL,
	"honeypot" varchar(100),
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp with time zone,
	"email_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(50) NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	"metadata" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name_en" varchar(100) NOT NULL,
	"display_name_fr" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"color" varchar(7),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "event_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "event_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"total_capacity" integer NOT NULL,
	"available_capacity" integer NOT NULL,
	"price_amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"allow_waitlist" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_sessions_capacity_check" CHECK (available_capacity >= 0 AND available_capacity <= total_capacity),
	CONSTRAINT "event_sessions_time_range_check" CHECK (end_time > start_time),
	CONSTRAINT "event_sessions_price_check" CHECK (price_amount >= 0)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_en" varchar(255) NOT NULL,
	"title_fr" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description_en" text NOT NULL,
	"description_fr" text NOT NULL,
	"subtitle_en" text,
	"subtitle_fr" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"location" varchar(500) NOT NULL,
	"venue_name" varchar(200),
	"street_address" varchar(255),
	"district" varchar(100),
	"city" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100),
	"collaborators" text,
	"timings" text,
	"curator_en" varchar(150),
	"curator_fr" varchar(150),
	"materials_en" text,
	"materials_fr" text,
	"admission_info_en" varchar(150),
	"admission_info_fr" varchar(150),
	"cover_media_id" uuid,
	"category_id" uuid,
	"published" boolean DEFAULT false NOT NULL,
	"is_spotlight" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "media_type" NOT NULL,
	"url" varchar(1000) NOT NULL,
	"s3_key" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"event_id" uuid,
	"talent_id" uuid,
	"is_cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_event_or_talent_check" CHECK ((event_id IS NOT NULL AND talent_id IS NULL) OR (event_id IS NULL AND talent_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"stripe_payment_intent_id" varchar(255) NOT NULL,
	"stripe_client_secret" text,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_payment_method_id" varchar(255),
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"receipt_url" varchar(1000),
	"stripe_charge_id" varchar(255),
	"last_error" text,
	"idempotency_key" varchar(255) NOT NULL,
	"webhook_processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_refund_check" CHECK (refunded_amount >= 0 AND refunded_amount <= amount)
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_session_id" uuid NOT NULL,
	"guest_email" varchar(255) NOT NULL,
	"guest_name" varchar(255) NOT NULL,
	"guest_phone" varchar(50),
	"notification_preference" "notification_preference" DEFAULT 'both' NOT NULL,
	"user_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"access_token" varchar(64) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"reminder_sent_1_week" boolean DEFAULT false NOT NULL,
	"reminder_sent_1_day" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_access_token_unique" UNIQUE("access_token"),
	CONSTRAINT "reservations_quantity_check" CHECK (quantity > 0),
	CONSTRAINT "reservations_amount_check" CHECK (total_amount >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name_en" varchar(100) NOT NULL,
	"display_name_fr" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"color" varchar(7),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "talent_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "talent_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "talents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role_en" varchar(150) NOT NULL,
	"role_fr" varchar(150) NOT NULL,
	"bio_en" text NOT NULL,
	"bio_fr" text NOT NULL,
	"profile_media_id" uuid,
	"category_id" uuid,
	"city" varchar(100),
	"country" varchar(100),
	"quote_en" text,
	"quote_fr" text,
	"specializations_en" text,
	"specializations_fr" text,
	"social_links" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_session_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(50),
	"notification_preference" "notification_preference" DEFAULT 'both' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_quantity_check" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_event_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_session_id_event_sessions_id_fk" FOREIGN KEY ("event_session_id") REFERENCES "public"."event_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talents" ADD CONSTRAINT "talents_category_id_talent_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."talent_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_event_session_id_event_sessions_id_fk" FOREIGN KEY ("event_session_id") REFERENCES "public"."event_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_submissions_email_idx" ON "contact_submissions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_submissions_inquiry_type_idx" ON "contact_submissions" USING btree ("inquiry_type");--> statement-breakpoint
CREATE INDEX "contact_submissions_email_sent_idx" ON "contact_submissions" USING btree ("email_sent");--> statement-breakpoint
CREATE INDEX "email_queue_status_idx" ON "email_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_queue_created_at_idx" ON "email_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_queue_status_attempts_last_attempt_idx" ON "email_queue" USING btree ("status","attempts","last_attempt_at");--> statement-breakpoint
CREATE INDEX "event_categories_slug_idx" ON "event_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "event_categories_published_idx" ON "event_categories" USING btree ("published");--> statement-breakpoint
CREATE INDEX "event_categories_sort_order_idx" ON "event_categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "event_sessions_event_id_idx" ON "event_sessions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_sessions_published_idx" ON "event_sessions" USING btree ("published");--> statement-breakpoint
CREATE INDEX "event_sessions_start_time_idx" ON "event_sessions" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "event_sessions_event_id_published_idx" ON "event_sessions" USING btree ("event_id","published");--> statement-breakpoint
CREATE INDEX "event_sessions_published_start_time_idx" ON "event_sessions" USING btree ("published","start_time");--> statement-breakpoint
CREATE INDEX "events_slug_idx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_published_idx" ON "events" USING btree ("published");--> statement-breakpoint
CREATE INDEX "events_start_date_idx" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "events_published_start_date_idx" ON "events" USING btree ("published","start_date");--> statement-breakpoint
CREATE INDEX "events_category_idx" ON "events" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "events_spotlight_idx" ON "events" USING btree ("is_spotlight");--> statement-breakpoint
CREATE INDEX "media_event_id_idx" ON "media" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "media_talent_id_idx" ON "media" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "media_is_cover_idx" ON "media" USING btree ("is_cover");--> statement-breakpoint
CREATE INDEX "payments_reservation_id_idx" ON "payments" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "payments_stripe_payment_intent_idx" ON "payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_idempotency_key_idx" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_webhook_processed_idx" ON "payments" USING btree ("webhook_processed_at") WHERE webhook_processed_at IS NULL;--> statement-breakpoint
CREATE INDEX "reservations_session_id_idx" ON "reservations" USING btree ("event_session_id");--> statement-breakpoint
CREATE INDEX "reservations_email_idx" ON "reservations" USING btree ("guest_email");--> statement-breakpoint
CREATE INDEX "reservations_access_token_idx" ON "reservations" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservations_expires_at_idx" ON "reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reservations_session_status_idx" ON "reservations" USING btree ("event_session_id","status");--> statement-breakpoint
CREATE INDEX "reservations_status_expires_idx" ON "reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "reservations_status_created_at_idx" ON "reservations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "talent_categories_slug_idx" ON "talent_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "talent_categories_published_idx" ON "talent_categories" USING btree ("published");--> statement-breakpoint
CREATE INDEX "talent_categories_sort_order_idx" ON "talent_categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "talents_published_idx" ON "talents" USING btree ("published");--> statement-breakpoint
CREATE INDEX "talents_name_idx" ON "talents" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE INDEX "talents_published_created_at_idx" ON "talents" USING btree ("published","created_at");--> statement-breakpoint
CREATE INDEX "talents_category_idx" ON "talents" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "waitlist_session_id_idx" ON "waitlist" USING btree ("event_session_id");--> statement-breakpoint
CREATE INDEX "waitlist_email_idx" ON "waitlist" USING btree ("email");--> statement-breakpoint
CREATE INDEX "waitlist_notified_idx" ON "waitlist" USING btree ("notified");--> statement-breakpoint
CREATE INDEX "waitlist_expires_at_idx" ON "waitlist" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "waitlist_notified_expires_at_idx" ON "waitlist" USING btree ("notified","expires_at");
