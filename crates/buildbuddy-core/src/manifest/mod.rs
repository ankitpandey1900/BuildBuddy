use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DependencyType {
    Direct,
    Dev,
    Peer,
    Optional,
}

impl DependencyType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::Dev => "dev",
            Self::Peer => "peer",
            Self::Optional => "optional",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestDependency {
    pub name: String,
    pub version_spec: Option<String>,
    pub dep_type: DependencyType,
    pub source_file: String,
    pub line_number: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManifestType {
    PackageJson,
    RequirementsTxt,
    PyProjectToml,
}

pub mod package_json;
pub mod python;
