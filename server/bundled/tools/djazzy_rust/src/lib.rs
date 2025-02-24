use std::fs;
use std::path::Path;
use tree_sitter::{Parser, Tree};
use tree_sitter_python::LANGUAGE;

const FUNCTION_CALLS: [&str; 2] = ["path", "re_path"];


pub fn extract_url_patterns(file_path: &Path) -> Vec<String> {
    let mut patterns = Vec::new();

    let source_code = match fs::read_to_string(file_path) {
        Ok(code) => code,
        Err(_) => return patterns,
    };
	
    let mut parser = Parser::new();
    parser.set_language(&LANGUAGE.into()).expect("Error loading Tree-sitter Python");

    let tree = match parser.parse(&source_code, None) {
        Some(tree) => tree,
        None => return patterns,
    };

    extract_from_tree(&tree, &source_code, &mut patterns);

    patterns
}

pub fn extract_from_tree(tree: &Tree, source_code: &str, patterns: &mut Vec<String>) {
    let mut cursor = tree.walk();

    // Recursively traverse the AST
    let mut stack = vec![cursor.node()];

    while let Some(node) = stack.pop() {
        if node.kind() == "call" {
            if let Some(pattern_name) = extract_pattern_name(node, source_code) {
                patterns.push(pattern_name);
            }
        }

        // Push child nodes to process next
        stack.extend(node.children(&mut cursor));
    }
}

pub fn extract_pattern_name(node: tree_sitter::Node, source_code: &str) -> Option<String> {
    let mut func_name = None;
    let mut name_arg = None;

    for child in node.children(&mut node.walk()) {
        if child.kind() == "identifier" {
            let text = &source_code[child.byte_range()];
            if FUNCTION_CALLS.contains(&text) {
                func_name = Some(text.to_string());
            }
        } else if child.kind() == "argument_list" {
            for arg in child.children(&mut child.walk()) {
                if arg.kind() == "keyword_argument" {
                    let arg_text = &source_code[arg.byte_range()];
                    if arg_text.contains("name=") {
                        let parts: Vec<&str> = arg_text.split('=').collect();
                        if parts.len() == 2 {
                            name_arg = Some(parts[1].trim_matches(|c: char| c == '"' || c == '\'').to_string());
                        }
                    }
                }
            }
        }
    }

    if func_name.is_some() && name_arg.is_some() {
        name_arg
    } else {
        None
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    fn create_temp_urls_py(content: &str) -> NamedTempFile {
        let mut file = NamedTempFile::new().expect("Failed to create temp file");
        writeln!(file, "{}", content).expect("Failed to write to temp file");
        file
    }

    #[test]
    fn test_extract_basic_urls() {
        let temp_file = create_temp_urls_py(
            r#"
            from django.urls import path
            urlpatterns = [
                path("", views.home, name="home"),
                path("profile/", views.profile, name="user-profile"),
            ]
            "#,
        );

        let mut urls = extract_url_patterns(temp_file.path());
        assert_eq!(urls.sort(), vec!["home", "user-profile"].sort());
    }

    #[test]
    fn test_extract_re_path_urls() {
        let temp_file = create_temp_urls_py(
            r#"
            from django.urls import re_path
            urlpatterns = [
                re_path(r"^dashboard/$", views.dashboard, name="dashboard"),
            ]
            "#,
        );

        let urls = extract_url_patterns(temp_file.path());
        assert_eq!(urls, vec!["dashboard"]);
    }

    #[test]
    fn test_ignore_include_urls() {
        let temp_file = create_temp_urls_py(
            r#"
            from django.urls import path, include
            urlpatterns = [
                path("", views.home, name="home"),
                path("blog/", include("blog.urls")),
            ]
            "#,
        );

        let urls = extract_url_patterns(temp_file.path());
        assert_eq!(urls, vec!["home"]); // Ensure it ignores `include()`
    }

    #[test]
    fn test_no_urls_found() {
        let temp_file = create_temp_urls_py(
            r#"
            # This is an empty urls.py file
            urlpatterns = []
            "#,
        );

        let urls = extract_url_patterns(temp_file.path());
        assert!(urls.is_empty());
    }
}
