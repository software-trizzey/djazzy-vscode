import dotenv from "dotenv";

dotenv.config();

export default {
	databaseUrl: process.env.DATABASE_URL,
	migrationsTable: "pgmigrations",
	direction: "up",
	count: Infinity,
	dir: "migrations",
};
