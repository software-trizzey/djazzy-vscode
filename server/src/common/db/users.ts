import { pool } from "./db";

import { User, Profile, CreateUser, CreateProfile } from "./types";

interface UserWithProfile extends User {
	profile: Omit<Profile, "id">;
}

export async function getUserById(id: string): Promise<User | undefined> {
	const client = await pool.connect();
	try {
		const result = await client.query<User>(
			`
			SELECT id, github_login, email, has_agreed_to_terms, created_at, updated_at, is_active, last_login
			FROM users
			WHERE id = $1;
			`,
			[id]
		);
		return result.rows[0];
	} catch (err) {
		console.error("Error getting user by ID:", err);
	} finally {
		client.release();
	}
}

export async function getUserByEmail(
	email: string
): Promise<UserWithProfile | undefined> {
	const client = await pool.connect();
	try {
		const result = await client.query<User & Profile>(
			`
			SELECT users.id, github_login, email, has_agreed_to_terms, created_at, updated_at, is_active, last_login, profiles.name, profiles.location
			FROM users
			INNER JOIN profiles ON users.id = profiles.id
			WHERE email = $1;
			`,
			[email]
		);
		const userWithProfile = {
			...result.rows[0],
			profile: {
				name: result.rows[0].name,
				location: result.rows[0].location,
			},
		};
		return userWithProfile;
	} catch (err) {
		console.error("Error getting user by email:", err);
	} finally {
		client.release();
	}
}

export async function createUserAndProfile(
	userInfo: CreateUser & CreateProfile
): Promise<UserWithProfile> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		const userResult = await client.query<User>(
			`
			INSERT INTO users (github_login, email, has_agreed_to_terms, created_at, updated_at, is_active, last_login)
			VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE, CURRENT_TIMESTAMP)
			ON CONFLICT (email) DO UPDATE
			SET github_login = EXCLUDED.github_login, 
				email = EXCLUDED.email, 
				has_agreed_to_terms = EXCLUDED.has_agreed_to_terms, 
				updated_at = CURRENT_TIMESTAMP, 
				last_login = CURRENT_TIMESTAMP
			RETURNING id, github_login, email, has_agreed_to_terms, created_at, updated_at, is_active, last_login;
      		`,
			[userInfo.github_login, userInfo.email, userInfo.has_agreed_to_terms]
		);

		const userId = userResult.rows[0].id;

		const profileResult = await client.query<Profile>(
			`
			INSERT INTO profiles (id, name, location)
			VALUES ($1, $2, $3)
			ON CONFLICT (id) DO UPDATE
			SET name = EXCLUDED.name, 
				location = EXCLUDED.location
			RETURNING name, location;
			`,
			[userId, userInfo.name, userInfo.location]
		);

		await client.query("COMMIT");

		const newAccount = {
			...userResult.rows[0],
			profile: { ...profileResult.rows[0] },
		};
		return newAccount;
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("Error saving user and profile data to database:", err);
		throw err;
	} finally {
		client.release();
	}
}

export async function updateLastLogin(id: string): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query(
			`
			UPDATE users
			SET last_login = CURRENT_TIMESTAMP
			WHERE id = $1;
			`,
			[id]
		);
	} catch (err) {
		console.error("Error updating last login:", err);
	} finally {
		client.release();
	}
}