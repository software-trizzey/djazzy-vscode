from djangoly.core.utils.issue import Issue, IssueSeverity, IssueDocLinks

class RedundantQueryMethodIssue(Issue):
    code = 'CDQ14'
    description = (
        'Redundant QuerySet method chain detected: "{method_chain}"\n\n'
        'The current chain of methods is unnecessary because the final method "{simplified_chain}" already provides the desired result.\n\n'
        'Consider replacing "{method_chain}" with "{simplified_chain}"\n\n'
        'Simplified queries avoid redundant operations, resulting in cleaner and easier-to-maintain code.'
    )

    def __init__(
        self,
        method_chain,
        simplified_chain,
        lineno,
        col_offset,
        end_col_offset,
        fixed_queryset,
        severity=IssueSeverity.INFORMATION
    ):
        formatted_method_chain = self.format_method_chain(method_chain)
        self.method_chain = method_chain
        self.simplified_chain = simplified_chain
        self.col_offset = col_offset
        self.end_col_offset = end_col_offset
        self.fixed_queryset = fixed_queryset

        parameters = {
            'method_chain': formatted_method_chain,
            'simplified_chain': simplified_chain,
            'severity': severity,
        }
        super().__init__(lineno, col_offset, parameters)

    def format_method_chain(self, method_chain):
        """
        Format the method chain to include '()' after each method, e.g., 'all().count()'
        """
        methods = method_chain.split(".")
        return ".".join([f"{method}()" for method in methods])

    @property
    def doc_link(self):
        return IssueDocLinks.QUERYSET_API
