export interface Profile {
	id: string; // UUID
	name: string;
	location: string;
}

export interface CreateProfile {
	name: string;
	location: string;
}