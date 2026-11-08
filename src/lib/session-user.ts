// The session shape that may leave the server (route context, loader and
// query data are dehydrated into the SSR HTML). Pure, safe for client code.

/**
 * The only session shape that leaves the server. Never add the session
 * token, IP address, user agent or ban fields here.
 */
export type SessionUser = {
	id: string;
	publicId: string;
	name: string;
	email: string;
	image: string | null;
	role: string | null;
	emailVerified: boolean;
	phoneNumber: string | null;
	createdAt: Date;
};

export type AppSession = { user: SessionUser } | null;

/** Better Auth user fields read by toSessionUser (a subset of its user row). */
interface AuthUserFields {
	id: string;
	publicId: string;
	name: string;
	email: string;
	image?: string | null;
	role?: string | null;
	emailVerified: boolean;
	phoneNumber?: string | null;
	createdAt: Date;
}

/** Copies only the allowed fields (explicit list, never a spread). */
export function toSessionUser(user: AuthUserFields): SessionUser {
	return {
		id: user.id,
		publicId: user.publicId,
		name: user.name,
		email: user.email,
		image: user.image ?? null,
		role: user.role ?? null,
		emailVerified: user.emailVerified,
		phoneNumber: user.phoneNumber ?? null,
		createdAt: user.createdAt,
	};
}
