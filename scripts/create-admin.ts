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
