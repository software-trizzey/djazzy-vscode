import Rollbar = require("rollbar");

export const rollbar = new Rollbar({
	accessToken: "e7e2e2ef986045dc9578c57a50c2db98",
	environment: process.env.NODE_ENV || "development",
	captureUncaught: true,
	captureUnhandledRejections: true,
});

const logger = process.env.NODE_ENV === "development" ? console : rollbar;


export function trackUserInterestInCustomRules(userId: string) {
	const message = `User ${userId} is interested automated rules setup.`;
	rollbar.info(message);
}

export default logger;
