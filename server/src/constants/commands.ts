export const FIX_NAME = "whenInRome.fixNamingConvention";
export const GET_CHANGED_LINES = "whenInRome.getGitDiff";
export const CREATE_REPOSITORY = "whenInRome.createRepository";
export const PROVIDE_RENAME_SUGGESTIONS = "whenInRome.provideRenameSuggestions";
export const APPLY_RENAME_SYMBOL = "whenInRome.applyRenameSymbol";

const COMMANDS = { FIX_NAME, GET_CHANGED_LINES, CREATE_REPOSITORY, PROVIDE_RENAME_SUGGESTIONS, APPLY_RENAME_SYMBOL };

export const COMMANDS_LIST = Object.values(COMMANDS);

export default COMMANDS;
