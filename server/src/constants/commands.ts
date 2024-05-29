export const FIX_NAME = "whenInRome.fixNamingConvention";
export const GET_CHANGED_LINES = "whenInRome.getGitDiff";
export const CREATE_REPOSITORY = "whenInRome.createRepository";
export const APPLY_RENAME = "whenInRome.applyRename";

const COMMANDS = { FIX_NAME, GET_CHANGED_LINES, CREATE_REPOSITORY, APPLY_RENAME };

export const COMMANDS_LIST = Object.values(COMMANDS);

export default COMMANDS;
