import { pool } from "./db";

import { User, Profile } from "./types";

export async function createUserAndProfile(
	userInfo: User & Profile
): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const userResult = await client.query<User>(
			`
			INSERT INTO users (id, github_login, email, has_agreed_to_terms, created_at, updated_at, is_active, last_login)
			VALUES (${userInfo.id}, ${userInfo.github_login}, ${userInfo.email}, ${userInfo.has_agreed_to_terms}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE, CURRENT_TIMESTAMP)
			ON CONFLICT (id) DO UPDATE
			SET github_login = ${userInfo.github_login}, email = ${userInfo.email}, has_agreed_to_terms = ${userInfo.has_agreed_to_terms}, updated_at = CURRENT_TIMESTAMP, last_login = CURRENT_TIMESTAMP
			RETURNING id;`,
			[
				userInfo.id,
				userInfo.github_login,
				userInfo.email,
				userInfo.has_agreed_to_terms,
			]
		);

		const userId = userResult.rows[0].id;

		await client.query<Profile>(
			`
			INSERT INTO profiles (id, name, location)
			VALUES (${userId}, ${userInfo.name}, ${userInfo.location})
			ON CONFLICT (id) DO UPDATE
			SET name = ${userInfo.name} location = ${userInfo.location};`,
			[userId, userInfo.name, userInfo.location]
		);

		console.log("User and profile data saved to database");
	} catch (err) {
		console.error("Error saving user and profile data to database:", err);
	} finally {
		client.release();
	}
}
