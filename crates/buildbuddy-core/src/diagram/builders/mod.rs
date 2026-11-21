pub mod file_dependency;
pub mod module_dependency;
pub mod architecture_overview;
pub mod class_diagram;
pub mod call_graph;
pub mod er_diagram;

pub use file_dependency::build_file_dependency_diagram;
pub use module_dependency::build_module_dependency_diagram;
pub use architecture_overview::build_architecture_overview_diagram;
pub use class_diagram::build_class_diagram;
pub use call_graph::build_call_graph;
pub use er_diagram::build_er_diagram;

/// Derives a logical, architectural directory/module group for a file.
/// Handles monorepos (apps/*, packages/*, libs/*) and standard directories (src/*)
/// without creating hundreds of noisy leaf-directory groups.
pub fn derive_dir_group(rel_path: &str) -> Option<(String, String)> {
    let norm = rel_path.replace('\\', "/");
    let parts: Vec<&str> = norm.split('/').collect();
    if parts.len() <= 1 {
        return None;
    }

    // Monorepo workspaces: apps/*, packages/*, libs/*, services/*, modules/*
    if parts.len() >= 2 && matches!(parts[0], "apps" | "packages" | "libs" | "services" | "modules") {
        let label = format!("{}/{}", parts[0], parts[1]);
        let gid = format!("group:dir:{}", label);
        return Some((gid, label));
    }

    // Standard src/ components or lib/
    if parts.len() >= 3 && matches!(parts[0], "src" | "app" | "lib") {
        let label = format!("{}/{}", parts[0], parts[1]);
        let gid = format!("group:dir:{}", label);
        return Some((gid, label));
    }

    // Top-level directory (e.g. docs, backend, frontend, scripts, src)
    let label = parts[0].to_string();
    let gid = format!("group:dir:{}", label);
    Some((gid, label))
}

