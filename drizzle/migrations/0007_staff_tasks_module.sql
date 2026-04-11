-- Add staff role to user_role enum
ALTER TYPE "user_role" ADD VALUE 'staff';

-- Create task_status enum
CREATE TYPE "task_status" AS ENUM ('pending', 'in_progress', 'done');

-- Create task_priority enum
CREATE TYPE "task_priority" AS ENUM ('low', 'medium', 'high');

-- Create event_staff table
CREATE TABLE "event_staff" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "role_label" varchar(100),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for event_staff
CREATE INDEX "event_staff_event_id_idx" ON "event_staff"("event_id");
CREATE INDEX "event_staff_user_id_idx" ON "event_staff"("user_id");
CREATE UNIQUE INDEX "event_staff_event_user_unique" ON "event_staff"("event_id", "user_id");

-- Create tasks table
CREATE TABLE "tasks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
    "assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" varchar(255) NOT NULL,
    "description" text,
    "due_date" timestamp with time zone,
    "status" "task_status" DEFAULT 'pending' NOT NULL,
    "priority" "task_priority" DEFAULT 'medium' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for tasks
CREATE INDEX "tasks_event_id_idx" ON "tasks"("event_id");
CREATE INDEX "tasks_assigned_to_idx" ON "tasks"("assigned_to");
CREATE INDEX "tasks_created_by_idx" ON "tasks"("created_by");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
