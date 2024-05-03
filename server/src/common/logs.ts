import * as Rollbar from "rollbar";

export const rollbar = new Rollbar({
	accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
	captureUncaught: true,
	captureUnhandledRejections: true,
});
