export enum Models {
	GROQ = 'GROQ',
	OPEN_AI = 'OPEN_AI'

}

export interface NPlusOneIssueFuture {
	start_line: number;
	start_character: number;
	end_line: number;
	end_character: number;
	code_snippet: string;
	description: string;
	suggestion: string;
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
	suggestion: string;
	start_line: number;
	end_line: number;
	score: number;
	severity: string;
}
  
export interface LLMNPlusOneResult {
    has_n_plus_one_issues: boolean;
    issues: Issue[];
}

  export interface DeveloperInput {
	functionName: string;
	functionBody: string;
	potentialIssues: Array<{
		id: string;
		startLine: number;
		endLine: number;
		message: string;
	}>;
}

  export interface ChatAPIResponse {
	has_n_plus_one_issues: boolean;
	issues: NPlusOneIssue[];
}