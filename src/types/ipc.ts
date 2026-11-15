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

export interface Parameter {
  name: string;
  type_annotation: string | null;
  default_value: string | null;
}

export interface SideEffectMarker {
  category: string;
  pattern: string;
  confidence: "confirmed" | "static" | "inferred" | "unknown" | string;
  line_number: number;
}

export interface ClassProperty {
  name: string;
  type_annotation: string | null;
  visibility: string | null;
  is_static: boolean;
}

export interface ClassMethod {
  name: string;
  signature: string;
  visibility: string | null;
  is_static: boolean;
}

export interface ClassConstructor {
  signature: string;
  parameters: Parameter[];
  start_line: number;
  end_line: number;
}

export interface StoredFunction {
  id: number;
  symbol_id: number;
  file_id: number;
  name: string;
  parameters: Parameter[];
  return_type: string | null;
  branch_count: number;
  loop_count: number;
  cyclomatic_complexity: number;
  has_error_handling: boolean;
  side_effects: SideEffectMarker[];
  imports_used: string[];
  callers: string[];
  callees: string[];
  source_evidence_id: number | null;
}

export interface StoredClass {
  id: number;
  symbol_id: number;
  file_id: number;
  name: string;
  superclass_name: string | null;
  interfaces: string[];
  properties: ClassProperty[];
  methods: ClassMethod[];
  constructors: ClassConstructor[];
  source_evidence_id: number | null;
}

export interface SymbolRecord {
  id: number;
  project_id: number;
  file_id: number;
  file_path: string;
  stable_id: string;
  name: string;
  qualified_name: string;
  kind: string;
  parent_name: string | null;
  signature: string | null;
  return_type: string | null;
  visibility: string | null;
  is_exported: boolean;
  is_async: boolean;
  docstring: string | null;
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
  confidence: "confirmed" | "static" | "inferred" | "unknown";
  complexity: number | null;
  has_error_handling: boolean;
  has_side_effects: boolean;
  callers: string[];
  callees: string[];
}

export interface ListSymbolsFilter {
  file_id?: number | null;
  kind?: string | null;
  language?: string | null;
  path_prefix?: string | null;
  is_exported?: boolean | null;
  min_complexity?: number | null;
  has_error_handling?: boolean | null;
  has_side_effects?: boolean | null;
  fts_query?: string | null;
  sort_by?: string | null;
  sort_direction?: "asc" | "desc" | string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface ClassDetailResponse {
  symbol: SymbolRecord;
  superclass_name: string | null;
  base_classes: string[];
  interfaces: string[];
  properties: ClassProperty[];
  methods: ClassMethod[];
  constructors: ClassConstructor[];
  instantiations: InstantiationDetailItem[];
}

export interface CallDetailItem {
  id: number;
  caller_symbol_id: number | null;
  caller_name: string | null;
  caller_file_path: string | null;
  callee_symbol_id: number | null;
  callee_name: string;
  callee_file_path: string | null;
  resolution_status: "confirmed" | "static" | "inferred" | "unknown";
  is_dynamic: boolean;
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
  snippet: string | null;
  confidence: string;
}

export interface InstantiationDetailItem {
  id: number;
  caller_symbol_id: number | null;
  caller_name: string | null;
  caller_file_path: string | null;
  class_symbol_id: number | null;
  class_name: string;
  resolution_status: "confirmed" | "static" | "inferred" | "unknown";
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
  snippet: string | null;
  confidence: string;
}

export interface SymbolDetail {
  symbol: SymbolRecord;
  snippet: string | null;
  function_metrics: StoredFunction | null;
  class_details: StoredClass | null;
  incoming_calls: CallDetailItem[];
  outgoing_calls: CallDetailItem[];
  instantiations: InstantiationDetailItem[];
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

export interface DependencyOverview {
  internal_edges_count: number;
  external_dependencies_count: number;
  unresolved_count: number;
  circular_cycles_count: number;
  unused_dependencies_count: number;
}

export interface CircularDependencyCycle {
  cycle_files: string[];
}

export interface ImportEdge {
  source_file_id: number;
  source_file_path: string;
  target_file_id: number | null;
  target_file_path: string | null;
  target_module: string;
  imported_name: string;
  is_type_only: boolean;
  line_number: number;
  resolution_status: "internal" | "external" | "unresolved";
  source_evidence_id: number | null;
}

export interface GitRepoStatus {
  is_git_repo: boolean;
  current_branch: string | null;
  commit_hash: string | null;
}

export interface EvidenceItem {
  file_path: string;
  start_line: number;
  end_line: number;
  snippet: string;
  signal_type: string;
  description: string;
}

export interface FrameworkDetection {
  name: string;
  version: string | null;
  confidence: "confirmed" | "static" | "inferred" | "unknown";
  evidence: EvidenceItem[];
}

export interface EntryPoint {
  name: string;
  entry_type: string;
  file_path: string;
  start_line: number;
  end_line: number;
  snippet: string;
  confidence: "confirmed" | "static" | "inferred" | "unknown";
}

export interface ModuleGroup {
  name: string;
  root_directory: string;
  layer: "frontend" | "backend" | "data" | "shared" | "config" | "unclassified";
  file_count: number;
  cohesion_score: number;
  files: string[];
}

export interface LanguageMetric {
  name: string;
  file_count: number;
  line_count: number;
  percentage: number;
}

export interface OverviewMetrics {
  total_files: number;
  total_modules: number;
  total_symbols: number;
  total_functions: number;
  total_classes: number;
  total_entry_points: number;
  total_dependencies: number;
  unsupported_files_count: number;
  partial_files_count: number;
}

export interface AnalysisCompletionDto {
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  files_scanned: number;
  files_parsed: number;
}

export interface DeclaredFramework {
  name: string;
  version: string | null;
  dependency_type: string;
  file_path: string;
  line_number: number;
}

export interface OverviewDataDto {
  project_name: string;
  root_path: string;
  metrics: OverviewMetrics;
  languages: LanguageMetric[];
  frameworks: FrameworkDetection[];
  declared_only?: DeclaredFramework[];
  entry_points: EntryPoint[];
  modules: ModuleGroup[];
  completion: AnalysisCompletionDto | null;
}

export interface ArchitectureNode {
  id: string;
  label: string;
  kind: string;
  layer: string;
  file_path: string | null;
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  edge_type: string;
  evidence_id?: number | null;
}

export interface ArchitectureGroup {
  id: string;
  label: string;
  layer: string;
  node_ids: string[];
}

export interface ArchitectureModel {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  groups: ArchitectureGroup[];
}
