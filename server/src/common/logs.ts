import Rollbar = require("rollbar");

export const rollbar = new Rollbar({
	accessToken: "bb31966b163846dcbe5e5d74f30fd9ad",
	environment: process.env.NODE_ENV || "development",
	captureUncaught: true,
	captureUnhandledRejections: true,
});


const LOGGER = process.env.NODE_ENV === "development" ? console : rollbar;

export default LOGGER;