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

