import { Pool } from "pg";

export const pool = new Pool({
	user: process.env.PG_USER,
	host: process.env.PG_HOST,
	database: process.env.PG_DATABASE,
	password: process.env.PG_PASSWORD,
	port: Number(process.env.PG_PORT),
	ssl: process.env.PG_SSL === "true", // Use SSL if needed
});

export async function testDatabaseConnection() {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await client.query(`SELECT NOW()`);
		console.log(result);
		return result;
	} catch (err) {
		console.error("Error connecting to the database:", err);
	}
}
