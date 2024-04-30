interface ReservedNames {
	model: string[];
	serializer: string[];
	view: string[];
}

export const DJANGO_RESERVED_NAMES: ReservedNames = {
	model: ["save", "delete", "__str__", "clean", "get_absolute_url"],
	serializer: [
		"create",
		"update",
		"validate",
		"validate_<field_name>",
		"get_queryset",
	],
	view: ["get", "post", "put", "delete", "get_queryset", "get_context_data"],
};
