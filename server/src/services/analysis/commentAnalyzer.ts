import { RuleCodes } from '../../constants/rules';


export class CommentAnalyzer {

    public isTodoOrFixme(comment: string): boolean {
		return /^(TODO|FIXME)/i.test(comment.trim());
	}

	public isIgnoreComment(comment: string): boolean {
		return /^djangoly-IGNORE/i.test(comment.trim());
	}

	public isCommentRedundant(
		comment: string,
		currentNode: any
	): { violates: boolean; reason: string, ruleCode: RuleCodes | null } {	
		const generalIdentifiers = [
			"Block",
			"IfStatement",
			"ForStatement",
			"return",
			"assignment",
		];
		const javascriptIdentifiers = [
			"VariableDeclaration",
			"ReturnStatement",
			"ExpressionStatement",
			"CallExpression",
		];
		const pythonIdentifiers = ["name", "classdef", "functiondef"];
		const djangoIdentifiers = [
			"django_method",
			"django_model",
			"django_model_field",
			"django_serializer_field",
			"django_model_method",
			"django_serializer_method",
			"django_view_method",
			"django_test_method",
		];
		const languageIdentifiers = generalIdentifiers.concat(
			javascriptIdentifiers,
			pythonIdentifiers,
			djangoIdentifiers
		);

		if (this.isTodoOrFixme(comment)) {
			return {
				violates: false,
				reason: "Comments prefixed with TODO or FIXME are ignored.",
				ruleCode: null,
			};
		} else if (this.isIgnoreComment(comment)) {
			return {
				violates: false,
				reason: "djangoly-ignore detected for this comment.",
				ruleCode: null,
			};
		} else if (languageIdentifiers.includes(currentNode.type)) {
			// TODO: What do we consider a simple expression?
			return {
				violates: true,
				reason:
					"This comment may not be necessary as the code below it is self-explanatory.",
				ruleCode: RuleCodes.COMMENT_VALIDATION,
			};
		} else {
			return { violates: false, reason: "", ruleCode: null };
		}
	}
}

