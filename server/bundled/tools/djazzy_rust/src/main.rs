use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::Path;
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};
use serde_json;

use djazzy_rust::extract_url_patterns;

const FILE_TYPES: [&str; 1] = ["urls.py"];
const IGNORED_DIRS: [&str; 4] = [
    ".venv",       
    "node_modules",   
    "__pycache__",    
    "migrations",     
];

#[derive(Serialize, Deserialize, Clone)]
struct UrlEntry {
    patterns: Vec<String>,
    mtime: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Cache {
    urls: HashMap<String, UrlEntry>,
    last_modified_at: DateTime<Utc>,
    version: String,
}

impl Cache {
    fn new(urls: HashMap<String, UrlEntry>) -> Self {
        Self {
            urls,
            last_modified_at: Utc::now(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    fn load_from_file(cache_path: &Path) -> Self {
        if let Ok(cache_content) = fs::read_to_string(cache_path) {
            if let Ok(cache) = serde_json::from_str::<Cache>(&cache_content) {
                return cache;
            }
        }
        Self::new(HashMap::new()) // Return empty cache if loading fails
    }

    fn save_to_file(&self, cache_path: &Path) {
        fs::write(cache_path, serde_json::to_string_pretty(self).expect("Failed to serialize cache"))
            .expect("Failed to write cache file");
    }
}

fn find_urls_py_files(root: &Path, existing_cache: &mut HashMap<String, UrlEntry>) -> HashMap<String, UrlEntry> {
    let mut results = HashMap::new();

    if root.is_dir() {
        for entry in fs::read_dir(root).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            
            // Skip ignored directories
            if path.is_dir() && path.file_name()
                .map_or(false, |name| IGNORED_DIRS.contains(&name.to_str().unwrap_or(""))) {
                continue;
            }

            if path.is_dir() {
                results.extend(find_urls_py_files(&path, existing_cache));
            } else if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                if FILE_TYPES.contains(&file_name) {
                    let metadata = fs::metadata(&path).expect("Failed to get file metadata");
                    let modified_time: DateTime<Utc> = metadata.modified().expect("Failed to get modified time").into();

                    // Check if file has changed
                    if let Some(existing_entry) = existing_cache.get(&path.to_string_lossy().to_string()) {
                        if existing_entry.mtime == modified_time {
                            results.insert(path.to_string_lossy().to_string(), existing_entry.clone());
                            continue; // Skip re-processing unchanged files
                        }
                    }

                    // File changed or not in cache -> reprocess
                    results.insert(
                        path.to_string_lossy().to_string(),
                        UrlEntry {
                            patterns: extract_url_patterns(&path),
                            mtime: modified_time,
                        }
                    );
                }
            }
        }
    }
    results
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: djazzy_rust <project_root>");
        std::process::exit(1);
    }

    let project_root = Path::new(&args[1]);
    let cache_path = project_root.join(".djazzy_cache.json");

    let mut cache = Cache::load_from_file(&cache_path);

    let updated_urls = find_urls_py_files(project_root, &mut cache.urls);

    cache.urls.extend(updated_urls);
    cache.last_modified_at = Utc::now();

    cache.save_to_file(&cache_path);

    println!("✅ Djazzy Rust cache updated: {}", cache_path.to_string_lossy());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;
    use std::path::PathBuf;

    fn create_test_file(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, content).expect("Failed to write test file");
        path
    }

    fn setup_test_project() -> TempDir {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        
        fs::create_dir(temp_dir.path().join("app1")).unwrap();
        fs::create_dir(temp_dir.path().join(".venv")).unwrap();
        fs::create_dir(temp_dir.path().join("app1/migrations")).unwrap();
        fs::create_dir(temp_dir.path().join("app1/__pycache__")).unwrap();

        // Create some urls.py files
        create_test_file(&temp_dir.path().join("app1"), "urls.py", r#"
            from django.urls import path
            urlpatterns = [
                path("", views.home, name="home"),
            ]
        "#);

        // Create a urls.py in an ignored directory
        create_test_file(&temp_dir.path().join(".venv"), "urls.py", r#"
            from django.urls import path
            urlpatterns = [
                path("", views.ignored, name="ignored"),
            ]
        "#);

        temp_dir
    }

    #[test]
    fn test_cache_creation() {
        let project_dir = setup_test_project();
        let cache_path = project_dir.path().join(".djazzy_cache.json");
        
        let mut cache = Cache::new(HashMap::new());
        let urls = find_urls_py_files(project_dir.path(), &mut cache.urls);
        cache.urls.extend(urls);
        cache.save_to_file(&cache_path);

        assert!(cache_path.exists());
        let loaded_cache = Cache::load_from_file(&cache_path);
        assert_eq!(loaded_cache.urls.len(), 1);
        assert!(loaded_cache.urls.values().any(|entry| entry.patterns.contains(&"home".to_string())));
    }

    #[test]
    fn test_ignored_directories() {
        let project_dir = setup_test_project();
        let mut cache = Cache::new(HashMap::new());
        let urls = find_urls_py_files(project_dir.path(), &mut cache.urls);

        assert!(!urls.values().any(|entry| entry.patterns.contains(&"ignored".to_string())));
        
        let all_patterns: Vec<_> = urls.values()
            .flat_map(|entry| &entry.patterns)
            .collect();
        assert_eq!(all_patterns, vec!["home"]);
    }

    #[test]
    fn test_cache_update() {
        let project_dir = setup_test_project();
        let cache_path = project_dir.path().join(".djazzy_cache.json");
        
        let mut initial_cache = Cache::new(HashMap::new());
        let urls = find_urls_py_files(project_dir.path(), &mut initial_cache.urls);
        initial_cache.urls.extend(urls);
        initial_cache.save_to_file(&cache_path);

        create_test_file(&project_dir.path().join("app1"), "urls.py", r#"
            from django.urls import path
            urlpatterns = [
                path("", views.home, name="home"),
                path("new/", views.new, name="new-view"),
            ]
        "#);

        let mut updated_cache = Cache::load_from_file(&cache_path);
        let new_urls = find_urls_py_files(project_dir.path(), &mut updated_cache.urls);
        updated_cache.urls.extend(new_urls);

        assert_eq!(updated_cache.urls.len(), 1);
        let patterns: Vec<_> = updated_cache.urls.values()
            .flat_map(|entry| &entry.patterns)
            .collect();
        assert!(patterns.contains(&&"home".to_string()));
        assert!(patterns.contains(&&"new-view".to_string()));
    }
}
