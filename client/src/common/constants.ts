export const AUTH_SERVER_URL =
	process.env.NODE_ENV === "production"
		? "https://rome-django-auth.onrender.com"
		: "http://127.0.0.1:8000";
