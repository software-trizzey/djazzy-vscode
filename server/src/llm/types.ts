export interface NPlusOneIssue {
	start_line: number;
	start_character: number;
	end_line: number;
	end_character: number;
	code_snippet: string;
	description: string;
	suggestion: string;
  }
  
  export interface LLMNPlusOneResult {
	has_n_plus_one_issues: boolean;
	issues: NPlusOneIssue[];
	summary: string;
	overall_efficiency_score: number;
	general_recommendations: string[];
  }