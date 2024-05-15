export interface User {
	id: string; // UUID
	github_login: string;
	email: string;
	has_agreed_to_terms: boolean;
	created_at: string; // TIMESTAMP WITH TIME ZONE
	updated_at: string; // TIMESTAMP WITH TIME ZONE
	is_active: boolean | null;
	last_login: string | null; // TIMESTAMP WITH TIME ZONE
}
