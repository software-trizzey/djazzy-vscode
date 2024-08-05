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
    startLine: number;
    endLine: number;
    startCol: number;
    endCol: number;
    message: string;
    problematicCode: string;
    suggestedFix: string;
    severity: Severity;
    score: number;
    contextualInfo?: {
        isInLoop: boolean;
        loopStartLine?: number;
        relatedField: string | null;
        queryType: string;
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
    potentialIssues: Issue[];
}

export interface ChatAPIResponse {
    has_n_plus_one_issues: boolean;
    issues: Issue[];
    error?: string;
    status?: number;
}