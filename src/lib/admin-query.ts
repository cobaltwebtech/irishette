import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as authSchema from '@/db/auth-schema';

/**
 * Get all admin users from the database
 * Admins are identified by having role = 'admin'
 */
export async function getAdminUsers(db: D1Database): Promise<string[]> {
	try {
		// Initialize drizzle with the database
		const drizzleDb = drizzle(db, { schema: authSchema });

		// Query users with admin role
		const adminUsers = await drizzleDb
			.select({
				email: authSchema.user.email,
			})
			.from(authSchema.user)
			.where(eq(authSchema.user.role, 'admin'));

		// Extract email addresses
		const adminEmails = adminUsers.map((user) => user.email);

		console.log(`Found ${adminEmails.length} admin users:`, adminEmails);

		return adminEmails;
	} catch (error) {
		console.error('Error querying admin users:', error);
		throw new Error(
			`Failed to get admin users: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

/**
 * Check if any admin users exist in the database
 */
export async function hasAdminUsers(db: D1Database): Promise<boolean> {
	try {
		const adminEmails = await getAdminUsers(db);
		return adminEmails.length > 0;
	} catch (error) {
		console.error('Error checking for admin users:', error);
		return false;
	}
}
