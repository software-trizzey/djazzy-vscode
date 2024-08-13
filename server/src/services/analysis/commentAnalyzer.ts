

export class CommentAnalyzer {
    public isTodoOrFixme(comment: string): boolean {
        return comment.includes("TODO") || comment.includes("FIXME");
    }

    public isIgnoreComment(comment: string): boolean {
        return comment.includes("TODO") || comment.includes("FIXME") || comment.includes("@djangoly-ignore");
    }

    public isCommentRedundant(comment: string, currentNode: any): { violates: boolean; reason: string } {
        return { violates: false, reason: "" };
    }
}

