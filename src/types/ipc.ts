export interface Project {
  id: number;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
  settings_json: string;
}

export interface FileRecord {
  id: number;
  project_id: number;
  relative_path: string;
  file_name: string;
  extension: string | null;
  language_id: number | null;
  size_bytes: number;
  line_count: number;
  function_count: number;
  class_count: number;
  import_count: number;
  content_hash: string;
  status: string;
  updated_at: string;
}

export interface FileContentDto {
  file_name: string;
  relative_path: string;
  extension: string | null;
  size_bytes: number;
  content: string;
  is_truncated: boolean;
}

export interface SymbolDto {
  stable_id: string;
  name: string;
  qualified_name: string;
  kind: "function" | "class" | "method" | "interface" | "type_alias" | "constant" | "variable";
  parent_name: string | null;
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
  signature: string;
  return_type: string | null;
  visibility: string | null;
  is_exported: boolean;
  is_async: boolean;
  docstring: string | null;
}

export interface ImportDto {
  source_module: string;
  imported_name: string;
  alias: string | null;
  is_type_only: boolean;
  line_number: number;
}

export interface ScanProgressPayload {
  project_id: number;
  files_scanned: number;
  current_file: string;
}

export interface ScanCompletePayload {
  project_id: number;
  analysis_run_id: number;
  total_files: number;
  duration_ms: number;
  status: "completed" | "cancelled" | "failed";
}

export interface ParseProgressPayload {
  project_id: number;
  files_parsed: number;
  total_files: number;
  current_file: string;
}

export interface ParseCompletePayload {
  project_id: number;
  total_parsed: number;
  status: "completed" | "cancelled" | "failed";
}

export type ViewType =
  | "overview"
  | "explorer"
  | "architecture"
  | "dependencies"
  | "apis"
  | "database"
  | "intelligence"
  | "security"
  | "reports"
  | "documentation";
