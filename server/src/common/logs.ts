import Rollbar = require("rollbar");

export const rollbar = new Rollbar({
	accessToken: "bb31966b163846dcbe5e5d74f30fd9ad",
	environment:  process.env.NODE_ENV === "development" ? "development" : "production",
	captureUncaught: true,
	captureUnhandledRejections: true,
	checkIgnore: (isUncaught, args, item: any) => {
		if (item.body.trace_chain && item.body.trace_chain.length > 0) {
			const exception = item.body.trace_chain[0].exception;
			if (exception && exception.message === "Canceled") {
				console.log("Ignoring Canceled: Canceled error", exception);
				return true;
			}
		}
		return false; // Let all other errors through
	},
});


const LOGGER = process.env.NODE_ENV === "development" ? console : rollbar;

export default LOGGER;