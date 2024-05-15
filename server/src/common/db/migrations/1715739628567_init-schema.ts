// migrations/1634567890123_init_schema.ts
import { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

export const up = (pgm: MigrationBuilder) => {
	pgm.createExtension("pgcrypto", { ifNotExists: true });

	pgm.createTable("users", {
		id: {
			type: "uuid",
			primaryKey: true,
			default: pgm.func("gen_random_uuid()"),
		},
		github_login: { type: "varchar", notNull: true },
		email: { type: "varchar", notNull: true, unique: true },
		has_agreed_to_terms: { type: "boolean" },
		created_at: {
			type: "timestamp with time zone",
			notNull: true,
			default: pgm.func("current_timestamp"),
		},
		updated_at: {
			type: "timestamp with time zone",
			notNull: true,
			default: pgm.func("current_timestamp"),
		},
		is_active: { type: "boolean", default: null },
		last_login: { type: "timestamp with time zone", default: null },
	});

	pgm.createTable("profiles", {
		id: {
			type: "uuid",
			primaryKey: true,
			references: "users",
			onDelete: "CASCADE",
		},
		name: { type: "varchar" },
		location: { type: "varchar" },
	});

	pgm.createTrigger("users", "refresh_updated_at", {
		when: "BEFORE",
		operation: "UPDATE",
		level: "ROW",
		function: {
			name: "refresh_updated_at_column",
		},
		functionParams: [],
	});

	pgm.createFunction(
		"refresh_updated_at_column",
		[],
		{
			returns: "TRIGGER",
			language: "plpgsql",
		},
		`
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    `
	);
};

export const down = (pgm: MigrationBuilder) => {
	pgm.dropTrigger("users", "refresh_updated_at");
	pgm.dropFunction("refresh_updated_at_column", []);
	pgm.dropTable("profiles");
	pgm.dropTable("users");
	pgm.dropExtension("pgcrypto");
};
