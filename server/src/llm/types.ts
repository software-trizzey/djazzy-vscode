export enum Models {
	GROQ = 'GROQ',
	OPEN_AI = 'OPEN_AI'
}

  export interface NPlusOneIssue {
	issue_id: string;
    description: string;
    suggestion: string;
    problematic_code: string;
    start_line?: number;
    end_line?: number;
}

export interface Issue {
    id: string;
    function_name: string;
    line: number;
    start_line: number;
    end_line: number;
    col_offset: number;
    end_col_offset: number;
    message: string;
    problematic_code: string;
    suggested_fix: string;
    severity: Severity;
    score: number;
    issue_type: string;
    contextual_info?: {
        is_in_loop: boolean;
        loop_start_line?: number;
        related_field: string | null;
        query_type: string;
        is_related_field_access: boolean;
        is_bulk_operation: boolean;
    };
}
  
export interface LLMNPlusOneResult {
    has_n_plus_one_issues: boolean;
    issues: Issue[];
    isRateLimited?: boolean;
    isForbidden?: boolean;
}

export enum Severity {
    HINT = 'HINT',
    INFORMATION = 'INFORMATION',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

export interface DeveloperInput {
    functionName: string;
    functionBody: string;
    context: FunctionContext | VariableContext;
    potentialIssues?: Issue[];
    isRenameSuggestion?: boolean;
}

export interface ChatAPIResponse {
    has_n_plus_one_issues: boolean;
    issues: Issue[];
    error?: string;
    status?: number;
}

export enum SymbolFunctionTypes {
    FUNCTION = "function",
    DJANGO_MODEL_METHOD = "django_model_method",
    DJANGO_SERIALIZER_METHOD = "django_serializer_method",
    DJANGO_VIEW_METHOD = "django_view_method",
    DJANGO_TESTCASE_METHOD = "django_testcase_method",
}

export interface RenameSuggestion {
	suggestedName: string;
	justification: string;
}

export interface ThemeSystemViolation {
	reason: string;
	violates: boolean;
	index: number;
	value: string;
}

export enum ContextType {
    function = "function",
    variable = "variable"
}

export interface VariableContext {
    name: string;
    type: ContextType.variable;
    usage: string;
    surroundingCode: string;
    examples: string[];
    languageId: string;
    violationReason?: string;
}

export interface FunctionContext {
    name: string;
    type: ContextType.function;
    usage: string;
    surroundingCode: string;
    examples: string[];
    languageId: string;
    violationReason?: string;
}