const defaultConventions = {
	python: {
		variable: {
			expressive: true,
			avoidShortNames: true,
			example: "user_response",
		},
		function: {
			expressive: true,
			avoidShortNames: true,
			example: "get_user_profile",
		},
		class: {
			expressive: true,
			avoidShortNames: true,
			example: "UserProfile",
		},
		boolean: {
			prefix: ["is", "has", "should", "can", "does"],
			positiveNaming: true,
			example: "is_active",
		},
		file: {
			avoidComponentInNonXSuffix: true,
			avoidIndexJs: true,
			avoidExportDefault: true,
			example: "UserProfile.py",
		},
	},
	javascript: {
		variable: {
			expressive: true,
			avoidShortNames: true,
			example: "userResponse",
		},
		function: {
			expressive: true,
			avoidShortNames: true,
			example: "getUserProfile",
		},
		class: {
			expressive: true,
			avoidShortNames: true,
			example: "UserProfile",
		},
		boolean: {
			prefix: ["is", "has", "should", "can", "does"],
			positiveNaming: true,
			example: "isActive",
		},
		file: {
			avoidComponentInNonXSuffix: true,
			avoidIndexJs: true,
			avoidExportDefault: true,
			example: {
				reactComponent: "JobAlert.js",
				regularFile: "userHelpers.js",
			},
		},
	},
	typescript: {
		variable: {
			expressive: true,
			avoidShortNames: true,
			example: "userResponse",
		},
		function: {
			expressive: true,
			avoidShortNames: true,
			example: "getUserProfile",
		},
		class: {
			expressive: true,
			avoidShortNames: true,
			example: "UserProfile",
		},
		interface: {
			appendInterface: true,
			avoidIPrefix: true,
			example: "UserProps",
		},
		boolean: {
			prefix: ["is", "has", "should", "can", "does"],
			positiveNaming: true,
			example: "isActive",
		},
		file: {
			avoidComponentInNonXSuffix: true,
			avoidIndexJs: true,
			avoidExportDefault: true,
			example: {
				reactComponent: "JobAlert.ts",
				regularFile: "userHelpers.ts",
			},
		},
	},
};

export default defaultConventions;
