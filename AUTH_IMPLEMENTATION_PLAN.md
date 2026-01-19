# 🔐 Authentication & Authorization Implementation Plan

## Overview

This plan provides step-by-step instructions to implement a complete authentication and authorization system in this SvelteKit application using session-based auth with secure HttpOnly cookies, server-side validation, and role-based access control.

**Target Architecture:**
- Session-based authentication (NO JWT in localStorage)
- Secure HttpOnly cookies
- Server-side session validation
- Role-based authorization (admin/user roles)
- PostgreSQL database with Drizzle ORM
- Zero third-party auth providers

---

## 📋 Prerequisites

**Database**: PostgreSQL with Drizzle ORM (already configured)

**Current Setup**:
- Database connection: `/home/henga/Documents/projects/germinal/src/lib/server/db/index.ts`
- Schema definitions: `/home/henga/Documents/projects/germinal/src/lib/server/db/schema.ts`
- Existing tables: events, talents, media

**Dependencies to Install**:
```bash
npm install argon2
npm install --save-dev @types/argon2
```

---

## 🗄️ STEP 1: Database Schema Extension

### File: `/home/henga/Documents/projects/germinal/src/lib/server/db/schema.ts`

**Action**: ADD the following schema definitions to the existing file

**Location**: Add after the existing `media` table definition, before the exports section

```typescript
// Users table for authentication
export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: varchar('role', { length: 50 }).notNull().default('user'), // 'admin' | 'user'
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// Sessions table for session management
export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(), // Random session ID
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Indexes for performance
export const sessionsUserIdIndex = index('sessions_user_id_idx').on(sessions.userId);
export const sessionsExpiresAtIndex = index('sessions_expires_at_idx').on(sessions.expiresAt);
```

**Note**: Ensure you add these to the existing schema file alongside events, talents, and media tables.

---

## 🔧 STEP 2: Create Database Migration

### Action: Generate and run migration

```bash
# Generate migration file
npx drizzle-kit generate

# This will create a new migration file in drizzle/migrations/ directory
# The file will contain SQL to create users and sessions tables

# Apply migration to database
npx drizzle-kit push
```

**Verification**: Check that `users` and `sessions` tables exist in your PostgreSQL database.

---

## 🛠️ STEP 3: Create Authentication Utilities

### File: `/home/henga/Documents/projects/germinal/src/lib/server/auth.ts`

**Action**: CREATE this new file

**Purpose**: Password hashing and verification

```typescript
import * as argon2 from 'argon2';

/**
 * Hash a plain text password using Argon2
 * @param password - Plain text password
 * @returns Hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
	return await argon2.hash(password);
}

/**
 * Verify a plain text password against a hash
 * @param hash - Stored password hash
 * @param password - Plain text password to verify
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, password);
	} catch (error) {
		return false;
	}
}
```

---

## 🎫 STEP 4: Create Session Management Utilities

### File: `/home/henga/Documents/projects/germinal/src/lib/server/session.ts`

**Action**: CREATE this new file

**Purpose**: Session creation, validation, and deletion

```typescript
import { db } from './db';
import { sessions, users } from './db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Generate a cryptographically secure random session ID
 */
function generateSessionId(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Create a new session for a user
 * @param userId - The user's UUID
 * @returns Session object with id and expiresAt
 */
export async function createSession(userId: string) {
	const sessionId = generateSessionId();
	const expiresAt = new Date(Date.now() + SESSION_DURATION);

	const [session] = await db
		.insert(sessions)
		.values({
			id: sessionId,
			userId,
			expiresAt
		})
		.returning();

	return session;
}

/**
 * Validate a session and return the associated user
 * @param sessionId - The session ID from cookie
 * @returns User object if session is valid, null otherwise
 */
export async function validateSession(sessionId: string) {
	const [result] = await db
		.select({
			user: users,
			session: sessions
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
		.limit(1);

	if (!result) {
		return null;
	}

	return {
		id: result.user.id,
		email: result.user.email,
		role: result.user.role,
		createdAt: result.user.createdAt
	};
}

/**
 * Delete a session (logout)
 * @param sessionId - The session ID to delete
 */
export async function deleteSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Delete all expired sessions (cleanup job)
 */
export async function deleteExpiredSessions(): Promise<void> {
	await db.delete(sessions).where(gt(new Date(), sessions.expiresAt));
}
```

---

## 🔐 STEP 5: Update SvelteKit App Types

### File: `/home/henga/Documents/projects/germinal/src/app.d.ts`

**Action**: REPLACE the existing empty interfaces with the following

```typescript
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}

		interface Locals {
			user: {
				id: string;
				email: string;
				role: string;
				createdAt: Date;
			} | null;
		}

		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
```

**Important**: This makes `event.locals.user` available throughout your SvelteKit app.

---

## 🪝 STEP 6: Implement Global Session Validation Hook

### File: `/home/henga/Documents/projects/germinal/src/hooks.server.ts`

**Action**: REPLACE the entire file content with the following

**Purpose**: Intercept all requests, validate session cookie, attach user to `event.locals`

```typescript
import { type Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	// Read session cookie
	const sessionId = event.cookies.get('session');

	// Initialize user as null
	event.locals.user = null;

	// If session cookie exists, validate it
	if (sessionId) {
		const user = await validateSession(sessionId);
		if (user) {
			event.locals.user = user;
		} else {
			// Invalid/expired session - clear the cookie
			event.cookies.delete('session', { path: '/' });
		}
	}

	// Continue with request
	return resolve(event);
};
```

---

## 🔑 STEP 7: Create Login Page UI

### File: `/home/henga/Documents/projects/germinal/src/routes/login/+page.svelte`

**Action**: CREATE this new file

**Purpose**: Login form UI

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
				Sign in to your account
			</h2>
		</div>

		<form method="POST" use:enhance class="mt-8 space-y-6">
			{#if form?.error}
				<div class="rounded-md bg-red-50 p-4">
					<p class="text-sm text-red-800">{form.error}</p>
				</div>
			{/if}

			<div class="rounded-md shadow-sm space-y-4">
				<div>
					<label for="email" class="block text-sm font-medium text-gray-700">
						Email address
					</label>
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
						placeholder="Email address"
					/>
				</div>

				<div>
					<label for="password" class="block text-sm font-medium text-gray-700">
						Password
					</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
						placeholder="Password"
					/>
				</div>
			</div>

			<div>
				<button
					type="submit"
					class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
				>
					Sign in
				</button>
			</div>
		</form>
	</div>
</div>
```

---

## 📤 STEP 8: Create Login Form Actions

### File: `/home/henga/Documents/projects/germinal/src/routes/login/+page.server.ts`

**Action**: CREATE this new file

**Purpose**: Handle login POST request, validate credentials, create session

```typescript
import { redirect, fail, type Actions } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '$lib/server/auth';
import { createSession } from '$lib/server/session';
import type { PageServerLoad } from './$types';

// Redirect to /admin if already logged in
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/admin');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');

		// Validate input
		if (!email || typeof email !== 'string') {
			return fail(400, { error: 'Email is required' });
		}

		if (!password || typeof password !== 'string') {
			return fail(400, { error: 'Password is required' });
		}

		// Find user by email
		const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

		if (!user) {
			return fail(400, { error: 'Invalid email or password' });
		}

		// Verify password
		const validPassword = await verifyPassword(user.passwordHash, password);

		if (!validPassword) {
			return fail(400, { error: 'Invalid email or password' });
		}

		// Create session
		const session = await createSession(user.id);

		// Set secure cookie
		cookies.set('session', session.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 60 * 60 * 24 * 7 // 7 days
		});

		// Redirect to admin dashboard
		throw redirect(302, '/admin');
	}
};
```

---

## 🚪 STEP 9: Create Logout Endpoint

### File: `/home/henga/Documents/projects/germinal/src/routes/logout/+server.ts`

**Action**: CREATE this new file

**Purpose**: Handle logout, destroy session, clear cookie

```typescript
import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session');

	// Delete session from database
	if (sessionId) {
		await deleteSession(sessionId);
	}

	// Clear session cookie
	cookies.delete('session', { path: '/' });

	// Redirect to login
	throw redirect(302, '/login');
};
```

---

## 🛡️ STEP 10: Create Admin Route Protection

### File: `/home/henga/Documents/projects/germinal/src/routes/admin/+layout.server.ts`

**Action**: CREATE this new file

**Purpose**: Block unauthenticated and non-admin users from accessing /admin routes

```typescript
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Block unauthenticated users
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Block non-admin users
	if (locals.user.role !== 'admin') {
		throw redirect(302, '/');
	}

	// Pass user to admin pages
	return {
		user: locals.user
	};
};
```

---

## 🎨 STEP 11: Create Admin Dashboard Placeholder

### File: `/home/henga/Documents/projects/germinal/src/routes/admin/+page.svelte`

**Action**: CREATE this new file

**Purpose**: Admin dashboard landing page

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();
</script>

<div class="min-h-screen bg-gray-100">
	<nav class="bg-white shadow-sm">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex justify-between h-16">
				<div class="flex items-center">
					<h1 class="text-xl font-semibold text-gray-900">Admin Dashboard</h1>
				</div>

				<div class="flex items-center gap-4">
					<span class="text-sm text-gray-700">
						{data.user.email}
						<span class="text-gray-500">({data.user.role})</span>
					</span>

					<form method="POST" action="/logout" use:enhance>
						<button
							type="submit"
							class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
						>
							Logout
						</button>
					</form>
				</div>
			</div>
		</div>
	</nav>

	<main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
		<div class="px-4 py-6 sm:px-0">
			<div class="border-4 border-dashed border-gray-200 rounded-lg h-96 flex items-center justify-center">
				<div class="text-center">
					<h2 class="text-2xl font-bold text-gray-900 mb-2">Welcome to Admin Dashboard</h2>
					<p class="text-gray-600">Authenticated as: <strong>{data.user.email}</strong></p>
					<p class="text-gray-600 mt-2">Role: <strong>{data.user.role}</strong></p>
				</div>
			</div>
		</div>
	</main>
</div>
```

---

## 🔒 STEP 12: Protect API Endpoints (CRITICAL)

### File: `/home/henga/Documents/projects/germinal/src/lib/server/guards.ts`

**Action**: CREATE this new file

**Purpose**: Reusable authorization guards for API routes

```typescript
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Require authenticated user
 * Throws 401 if not authenticated
 */
export function requireAuth(event: RequestEvent) {
	if (!event.locals.user) {
		throw error(401, 'Unauthorized - Authentication required');
	}
	return event.locals.user;
}

/**
 * Require admin role
 * Throws 401 if not authenticated, 403 if not admin
 */
export function requireAdmin(event: RequestEvent) {
	const user = requireAuth(event);

	if (user.role !== 'admin') {
		throw error(403, 'Forbidden - Admin access required');
	}

	return user;
}
```

---

## 🛠️ STEP 13: Apply Auth Guards to Existing API Routes

### Files to Update:

Apply `requireAdmin` guard to ALL write operations (POST, PATCH, DELETE) in:

1. `/home/henga/Documents/projects/germinal/src/routes/api/events/+server.ts`
2. `/home/henga/Documents/projects/germinal/src/routes/api/events/[id]/+server.ts`
3. `/home/henga/Documents/projects/germinal/src/routes/api/talents/+server.ts`
4. `/home/henga/Documents/projects/germinal/src/routes/api/talents/[id]/+server.ts`
5. `/home/henga/Documents/projects/germinal/src/routes/api/media/upload/+server.ts`
6. `/home/henga/Documents/projects/germinal/src/routes/api/media/[id]/+server.ts`

### Example Pattern:

#### BEFORE (unprotected):
```typescript
export const POST: RequestHandler = async ({ request }) => {
	// ... handler code
};
```

#### AFTER (protected):
```typescript
import { requireAdmin } from '$lib/server/guards';

export const POST: RequestHandler = async (event) => {
	requireAdmin(event); // Add this line at the start

	const { request } = event;
	// ... rest of handler code
};
```

### Detailed Implementation for Each File:

#### 1. `/home/henga/Documents/projects/germinal/src/routes/api/events/+server.ts`

**Action**:
- Add import: `import { requireAdmin } from '$lib/server/guards';`
- Update `POST` handler to call `requireAdmin(event)` as first line

#### 2. `/home/henga/Documents/projects/germinal/src/routes/api/events/[id]/+server.ts`

**Action**:
- Add import: `import { requireAdmin } from '$lib/server/guards';`
- Update `PATCH` handler to call `requireAdmin(event)` as first line
- Update `DELETE` handler to call `requireAdmin(event)` as first line

#### 3. `/home/henga/Documents/projects/germinal/src/routes/api/talents/+server.ts`

**Action**:
- Add import: `import { requireAdmin } from '$lib/server/guards';`
- Update `POST` handler to call `requireAdmin(event)` as first line

#### 4. `/home/henga/Documents/projects/germinal/src/routes/api/talents/[id]/+server.ts`

**Action**:
- Add import: `import { requireAdmin } from '$lib/server/guards';`
- Update `PATCH` handler to call `requireAdmin(event)` as first line
- Update `DELETE` handler to call `requireAdmin(event)` as first line

#### 5. `/home/henga/Documents/projects/germinal/src/routes/api/media/upload/+server.ts`

**Action**:
- Add import: `import { requireAdmin } from '$lib/server/guards';`
- Update `POST` handler to call `requireAdmin(event)` as first line

#### 6. `/home/henga/Documents/projects/germinal/src/routes/api/media/[id]/+server.ts`

**Action**:
- Add import: `import { requireAdmin } from '$lib/server/guards';`
- Update `DELETE` handler to call `requireAdmin(event)` as first line

**Note**: Keep GET requests public so visitors can view events and talents.

---

## 👤 STEP 14: Create Initial Admin User

### File: `/home/henga/Documents/projects/germinal/scripts/create-admin.ts`

**Action**: CREATE this new file

**Purpose**: Script to create first admin user

```typescript
import { db } from '../src/lib/server/db';
import { users } from '../src/lib/server/db/schema';
import { hashPassword } from '../src/lib/server/auth';
import { eq } from 'drizzle-orm';

const ADMIN_EMAIL = 'admin@germinal.com';
const ADMIN_PASSWORD = 'changeme123'; // CHANGE THIS!

async function createAdmin() {
	console.log('Creating admin user...');

	// Check if admin already exists
	const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);

	if (existing) {
		console.log(`Admin user already exists: ${ADMIN_EMAIL}`);
		return;
	}

	// Hash password
	const passwordHash = await hashPassword(ADMIN_PASSWORD);

	// Create admin user
	const [admin] = await db
		.insert(users)
		.values({
			email: ADMIN_EMAIL,
			passwordHash,
			role: 'admin'
		})
		.returning();

	console.log('Admin user created successfully!');
	console.log(`Email: ${admin.email}`);
	console.log(`Role: ${admin.role}`);
	console.log(`\n⚠️  IMPORTANT: Change the password after first login!\n`);
}

createAdmin()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('Error creating admin user:', error);
		process.exit(1);
	});
```

### Update `package.json`:

**Action**: ADD this script to the `scripts` section

```json
{
	"scripts": {
		"create-admin": "tsx scripts/create-admin.ts"
	}
}
```

**Install tsx** (if not already installed):
```bash
npm install --save-dev tsx
```

**Run the script**:
```bash
npm run create-admin
```

---

## 🧪 STEP 15: Testing Checklist

After implementing all steps, test the following:

### ✅ Authentication Flow

1. **Login Page Access**
   - Navigate to `http://localhost:5173/login`
   - Page should load without errors

2. **Invalid Login**
   - Try logging in with wrong credentials
   - Should show error message
   - Should NOT create session cookie

3. **Valid Login**
   - Login with admin credentials (from STEP 14)
   - Should redirect to `/admin`
   - Check browser DevTools → Application → Cookies
   - Should see `session` cookie with `HttpOnly` and `Secure` flags

4. **Already Logged In**
   - Try accessing `/login` while logged in
   - Should redirect to `/admin` immediately

### ✅ Authorization Flow

5. **Admin Dashboard Access**
   - Navigate to `/admin` while logged in as admin
   - Should display dashboard with user email and role
   - Should show logout button

6. **Unauthenticated Admin Access**
   - Clear cookies or use incognito window
   - Navigate to `/admin`
   - Should redirect to `/login`

7. **Non-Admin User** (if you create one)
   - Create a regular user with role `'user'`
   - Login as that user
   - Try accessing `/admin`
   - Should redirect to home page `/`

### ✅ Session Management

8. **Logout**
   - Click logout button in admin dashboard
   - Should redirect to `/login`
   - Session cookie should be cleared
   - Trying to access `/admin` should redirect to `/login`

9. **Session Persistence**
   - Login as admin
   - Close browser
   - Reopen and navigate to `/admin`
   - Should still be logged in (session persists for 7 days)

### ✅ API Protection

10. **Protected API Endpoints**
    - Try making POST request to `/api/events` WITHOUT being logged in
    - Should return `401 Unauthorized`

    ```bash
    curl -X POST http://localhost:5173/api/events \
      -H "Content-Type: application/json" \
      -d '{"title":"Test Event"}'
    ```

11. **Authenticated API Access**
    - Login via browser (to get session cookie)
    - Copy session cookie value from DevTools
    - Make POST request with cookie:

    ```bash
    curl -X POST http://localhost:5173/api/events \
      -H "Content-Type: application/json" \
      -H "Cookie: session=YOUR_SESSION_ID_HERE" \
      -d '{"title":"Test Event", "slug":"test-event", ...}'
    ```
    - Should succeed if admin

### ✅ Public Access

12. **Public Pages**
    - Navigate to `/`, `/events`, `/talents`, `/contact` without logging in
    - All should be accessible
    - GET requests to `/api/events`, `/api/talents` should work

---

## 🔐 STEP 16: Security Hardening (Optional but Recommended)

### 16.1 Add Rate Limiting to Login

**File**: `/home/henga/Documents/projects/germinal/src/routes/login/+page.server.ts`

**Enhancement**: Add basic rate limiting to prevent brute force attacks

**Install dependency**:
```bash
npm install @vercel/speed-insights
```

**OR implement custom in-memory rate limiter**:

Create `/home/henga/Documents/projects/germinal/src/lib/server/rate-limit.ts`:

```typescript
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	const attempt = loginAttempts.get(ip);

	if (!attempt || now > attempt.resetAt) {
		loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}

	if (attempt.count >= MAX_ATTEMPTS) {
		return false;
	}

	attempt.count++;
	return true;
}

export function resetRateLimit(ip: string): void {
	loginAttempts.delete(ip);
}
```

**Usage in login action**:
```typescript
import { checkRateLimit, resetRateLimit } from '$lib/server/rate-limit';

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const ip = getClientAddress();

		if (!checkRateLimit(ip)) {
			return fail(429, { error: 'Too many login attempts. Try again later.' });
		}

		// ... existing login logic

		// On successful login:
		resetRateLimit(ip);

		// ... rest of code
	}
};
```

### 16.2 Add Session Cleanup Cron Job

**File**: `/home/henga/Documents/projects/germinal/src/hooks.server.ts`

**Enhancement**: Periodically clean up expired sessions

```typescript
import { type Handle } from '@sveltejs/kit';
import { validateSession, deleteExpiredSessions } from '$lib/server/session';

// Run cleanup every hour
setInterval(
	() => {
		deleteExpiredSessions().catch(console.error);
	},
	60 * 60 * 1000
);

export const handle: Handle = async ({ event, resolve }) => {
	// ... existing code
};
```

### 16.3 Add CSRF Protection (SvelteKit built-in)

**Verification**: SvelteKit automatically includes CSRF protection for form actions.

Ensure you're using `use:enhance` in forms (already done in STEP 7).

### 16.4 Environment Variable for Session Duration

**File**: `/home/henga/Documents/projects/germinal/src/lib/server/env.ts`

**Action**: Add session configuration to env validation

```typescript
export const env = z
	.object({
		// ... existing fields
		SESSION_DURATION_DAYS: z.coerce.number().default(7)
	})
	.parse(process.env);
```

**File**: `/home/henga/Documents/projects/germinal/src/lib/server/session.ts`

**Update**:
```typescript
import { env } from './env';

const SESSION_DURATION = env.SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
```

---

## 📝 STEP 17: Create User Management Endpoints (Future Extension)

**Purpose**: Allow admins to create additional users

### File: `/home/henga/Documents/projects/germinal/src/routes/api/users/+server.ts`

**Action**: CREATE this new file

```typescript
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guards';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth';
import type { RequestHandler } from './$types';

// List all users (admin only)
export const GET: RequestHandler = async (event) => {
	requireAdmin(event);

	const allUsers = await db
		.select({
			id: users.id,
			email: users.email,
			role: users.role,
			createdAt: users.createdAt
		})
		.from(users);

	return json(allUsers);
};

// Create new user (admin only)
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);

	const { email, password, role } = await event.request.json();

	// Validation
	if (!email || !password) {
		return json({ error: 'Email and password required' }, { status: 400 });
	}

	if (role && !['admin', 'user'].includes(role)) {
		return json({ error: 'Invalid role' }, { status: 400 });
	}

	// Hash password
	const passwordHash = await hashPassword(password);

	// Create user
	const [newUser] = await db
		.insert(users)
		.values({
			email,
			passwordHash,
			role: role || 'user'
		})
		.returning({
			id: users.id,
			email: users.email,
			role: users.role,
			createdAt: users.createdAt
		});

	return json(newUser, { status: 201 });
};
```

---

## 🎯 Final Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     SvelteKit Application                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PUBLIC ROUTES                 PROTECTED ROUTES            │
│  ├─ / (home)                   ├─ /admin/* (admin only)   │
│  ├─ /events                    │  └─ Guarded by            │
│  ├─ /talents                   │     +layout.server.ts     │
│  └─ /contact                   │                            │
│                                                             │
│  AUTH ROUTES                   API ROUTES                  │
│  ├─ /login                     ├─ GET /api/* (public)     │
│  └─ /logout                    └─ POST/PATCH/DELETE       │
│                                   (admin only via guards)   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     hooks.server.ts                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Read session cookie from request                 │  │
│  │ 2. Validate session via validateSession()           │  │
│  │ 3. Attach user to event.locals.user                 │  │
│  │ 4. Continue to route handler                        │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                   Server Utilities                          │
│  ┌──────────────┬──────────────┬─────────────────────────┐ │
│  │ auth.ts      │ session.ts   │ guards.ts              │ │
│  ├──────────────┼──────────────┼─────────────────────────┤ │
│  │ - hashPwd    │ - create     │ - requireAuth()        │ │
│  │ - verifyPwd  │ - validate   │ - requireAdmin()       │ │
│  │              │ - delete     │                         │ │
│  └──────────────┴──────────────┴─────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Database (PostgreSQL)                    │
│  ┌──────────┬────────────┬───────────┬──────────────────┐  │
│  │ users    │ sessions   │ events    │ talents / media  │  │
│  ├──────────┼────────────┼───────────┼──────────────────┤  │
│  │ id       │ id         │ (existing tables)           │  │
│  │ email    │ user_id ───┤                              │  │
│  │ password │ expires_at │                              │  │
│  │ role     │            │                              │  │
│  └──────────┴────────────┴───────────┴──────────────────┘  │
└─────────────────────────────────────────────────────────────┘

SESSION FLOW:
1. User submits login form → /login (POST action)
2. Verify credentials → Create session → Set HttpOnly cookie
3. Redirect to /admin
4. All subsequent requests → hooks.server.ts validates session
5. event.locals.user populated if valid
6. Route guards check event.locals.user
7. Logout → Delete session + Clear cookie
```

---

## ✅ Implementation Completion Checklist

Mark each item as you complete it:

- [ ] **STEP 1**: Database schema extended (users + sessions tables)
- [ ] **STEP 2**: Migration generated and applied
- [ ] **STEP 3**: auth.ts created (password hashing)
- [ ] **STEP 4**: session.ts created (session management)
- [ ] **STEP 5**: app.d.ts updated (TypeScript types)
- [ ] **STEP 6**: hooks.server.ts updated (global session validation)
- [ ] **STEP 7**: Login page UI created
- [ ] **STEP 8**: Login form action created
- [ ] **STEP 9**: Logout endpoint created
- [ ] **STEP 10**: Admin layout guard created
- [ ] **STEP 11**: Admin dashboard created
- [ ] **STEP 12**: Authorization guards created
- [ ] **STEP 13**: All API routes protected
- [ ] **STEP 14**: Initial admin user created
- [ ] **STEP 15**: All tests passing
- [ ] **STEP 16**: Security hardening applied (optional)
- [ ] **STEP 17**: User management endpoints created (optional)

---

## 🚀 Post-Implementation Tasks

1. **Change Default Admin Password**
   - Login with default credentials
   - Implement password change functionality
   - Update admin password immediately

2. **Configure Environment Variables**
   - Add `SESSION_DURATION_DAYS=7` to `.env` file
   - Ensure `DATABASE_URL` is set for production

3. **Test in Production**
   - Verify HTTPS is enabled (required for secure cookies)
   - Test all authentication flows
   - Monitor session creation/deletion

4. **Future Enhancements**
   - Add password reset via email
   - Add two-factor authentication (2FA)
   - Add user profile management
   - Add audit logging
   - Add remember me functionality
   - Add password strength requirements

---

## 🔍 Troubleshooting Guide

### Issue: Cannot login / "Invalid credentials" error

**Check**:
1. Admin user exists in database: `SELECT * FROM users WHERE email = 'admin@germinal.com';`
2. Password hash is valid (not empty)
3. Password verification function works
4. Database connection is established

### Issue: Redirected to /login immediately after logging in

**Check**:
1. Session cookie is being set (DevTools → Application → Cookies)
2. Cookie has correct attributes (HttpOnly, Secure, SameSite)
3. `hooks.server.ts` is validating session correctly
4. Session exists in database: `SELECT * FROM sessions;`

### Issue: Session expires immediately

**Check**:
1. `expiresAt` timestamp is in the future
2. System clock is correct
3. Session validation query checks `expiresAt > NOW()`

### Issue: Admin routes not protected

**Check**:
1. `/admin/+layout.server.ts` exists and exports `load` function
2. Load function checks `locals.user` and `role`
3. File is in correct directory

### Issue: API routes still allow unauthenticated access

**Check**:
1. `requireAdmin(event)` is called at start of handler
2. Import statement is correct
3. Handler uses `async (event)` signature (not destructured)

---

## 📚 File Structure Summary

```
src/
├── lib/
│   ├── server/
│   │   ├── auth.ts                    [NEW] Password hashing
│   │   ├── session.ts                 [NEW] Session management
│   │   ├── guards.ts                  [NEW] Authorization guards
│   │   ├── db/
│   │   │   ├── schema.ts              [MODIFIED] Added users/sessions
│   │   │   └── index.ts               [EXISTING]
│   │   └── env.ts                     [MODIFIED] Session config
│   └── types/                         [EXISTING]
├── routes/
│   ├── login/
│   │   ├── +page.svelte               [NEW] Login UI
│   │   └── +page.server.ts            [NEW] Login action
│   ├── logout/
│   │   └── +server.ts                 [NEW] Logout handler
│   ├── admin/
│   │   ├── +layout.server.ts          [NEW] Route protection
│   │   └── +page.svelte               [NEW] Dashboard UI
│   └── api/
│       ├── events/+server.ts          [MODIFIED] Added requireAdmin
│       ├── events/[id]/+server.ts     [MODIFIED] Added requireAdmin
│       ├── talents/+server.ts         [MODIFIED] Added requireAdmin
│       ├── talents/[id]/+server.ts    [MODIFIED] Added requireAdmin
│       ├── media/upload/+server.ts    [MODIFIED] Added requireAdmin
│       ├── media/[id]/+server.ts      [MODIFIED] Added requireAdmin
│       └── users/+server.ts           [NEW] User management
├── app.d.ts                           [MODIFIED] Added Locals type
└── hooks.server.ts                    [MODIFIED] Session validation

scripts/
└── create-admin.ts                    [NEW] Admin user creation

package.json                           [MODIFIED] Added create-admin script
```

---

## 🎓 Code Conventions Used

1. **Imports**: Always use `$lib` alias for internal imports
2. **Database**: Use Drizzle ORM with typed queries
3. **Validation**: Use Zod for input validation (extend as needed)
4. **Error Handling**: Use SvelteKit's `error()` helper
5. **Redirects**: Use `throw redirect()` for server-side redirects
6. **Types**: Use generated `./$types` for route types
7. **Naming**:
   - Files: kebab-case (`auth.ts`, `rate-limit.ts`)
   - Functions: camelCase (`hashPassword`, `requireAdmin`)
   - Tables: plural (`users`, `sessions`)
   - Interfaces: PascalCase (generated by SvelteKit)

---

## 🔐 Security Best Practices Implemented

✅ **Password Security**
- Argon2 hashing (industry standard, better than bcrypt)
- Passwords never stored in plain text
- Passwords never sent to client

✅ **Session Security**
- HttpOnly cookies (not accessible via JavaScript)
- Secure flag (HTTPS only)
- SameSite=lax (CSRF protection)
- Server-side session storage
- Session expiration
- Cryptographically random session IDs

✅ **Authorization**
- Server-side validation only
- Role-based access control
- Route guards at layout level
- API guards at handler level
- Principle of least privilege

✅ **Attack Prevention**
- No sensitive data in client code
- No JWT in localStorage
- Session validation on every request
- Optional rate limiting
- Automatic CSRF protection (SvelteKit)

---

## 📖 Usage Instructions for Future LLM

**To implement this plan**:

1. Read this document from top to bottom
2. Execute each STEP in sequential order
3. Do NOT skip steps (dependencies exist)
4. Do NOT modify file paths
5. Use EXACT code provided (adapt only if existing code conflicts)
6. Run tests in STEP 15 after completing STEP 14
7. Mark checklist items as you complete them

**Code adaptation rules**:
- If existing code has different formatting, match the existing style
- If existing code has different import patterns, use existing patterns
- If schema uses different conventions, adapt table/column names but keep logic
- Always preserve existing functionality when modifying files

**This plan is complete and production-ready.**

---

**END OF IMPLEMENTATION PLAN**
