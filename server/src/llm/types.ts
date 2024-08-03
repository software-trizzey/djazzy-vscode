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
	issue_id: string;
	description: string;
    problematic_code: string;
	suggestion: string;
	start_line: number;
	end_line: number;
	start_col: number;
	end_col: number;
	score: number;
	severity: string;
}
  
export interface LLMNPlusOneResult {
    has_n_plus_one_issues: boolean;
    issues: Issue[];
}

export interface PossibleIssue {
    id: string;
    startLine: number;
    endLine: number;
    startCol: number;
    endCol: number;
    message: string;
}

export interface DeveloperInput {
    functionName: string;
    functionBody: string;
    potentialIssues: Array<{
        id: string;
        startLine: number;
        endLine: number;
        startCol: number;
        endCol: number;
        message: string;
    }>;
}

  export interface ChatAPIResponse {
	has_n_plus_one_issues: boolean;
	issues: NPlusOneIssue[];
}