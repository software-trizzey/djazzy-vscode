import Rollbar = require("rollbar");

export const rollbar = new Rollbar({
	accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
	environment: process.env.NODE_ENV || "development",
	captureUncaught: true,
	captureUnhandledRejections: true,
});
