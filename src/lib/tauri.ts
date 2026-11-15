import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  ArchitectureModel,
  ClassDetailResponse,
  FileContentDto,
  FileRecord,
  ImportDto,
  ListSymbolsFilter,
  OverviewDataDto,
  ParseCompletePayload,
  ParseProgressPayload,
  Project,
  ScanCompletePayload,
  ScanProgressPayload,
  SymbolDetail,
  SymbolDto,
  SymbolRecord,
} from "@/types/ipc";
import type {
  DiagramOptions,
  DiagramResponse,
  DiagramType,
  DrillDownResult,
} from "@/types/diagram";

// Safely detect if running inside Tauri webview
export const isTauri = () => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

export async function selectAndOpenProject(): Promise<Project | null> {
  if (!isTauri()) {
    console.warn("Tauri environment not detected - using mock project");
    return {
      id: 1,
      name: "Mock Project",
      root_path: "/mock/project",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      settings_json: "{}",
    };
  }
  return await tauriInvoke<Project | null>("select_and_open_project");
}

export async function openProjectByPath(path: string): Promise<Project> {
  if (!isTauri()) {
    return {
      id: 1,
      name: path.split("/").pop() || "Mock Project",
      root_path: path,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      settings_json: "{}",
    };
  }
  return await tauriInvoke<Project>("open_project_by_path", { path });
}

export async function getRecentProjects(): Promise<Project[]> {
  if (!isTauri()) return [];
  return await tauriInvoke<Project[]>("get_recent_projects");
}

export async function getProject(projectId: number): Promise<Project> {
  if (!isTauri()) {
    return {
      id: projectId,
      name: "Mock Project",
      root_path: "/mock/project",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      settings_json: "{}",
    };
  }
  return await tauriInvoke<Project>("get_project", { projectId });
}

export async function startScan(projectId: number): Promise<number> {
  if (!isTauri()) return 1;
  return await tauriInvoke<number>("start_scan", { projectId });
}

export async function cancelScan(): Promise<boolean> {
  if (!isTauri()) return true;
  return await tauriInvoke<boolean>("cancel_scan");
}

export async function getFiles(
  projectId: number,
  search?: string,
  extension?: string,
): Promise<FileRecord[]> {
  if (!isTauri()) return [];
  return await tauriInvoke<FileRecord[]>("get_files", {
    projectId,
    search: search || null,
    extension: extension || null,
  });
}

export async function readFileContent(
  projectId: number,
  relativePath: string,
): Promise<FileContentDto> {
  if (!isTauri()) {
    return {
      file_name: relativePath.split("/").pop() || "file",
      relative_path: relativePath,
      extension: relativePath.split(".").pop() || null,
      size_bytes: 100,
      content: `// Mock content for ${relativePath}\nconsole.log("Hello from mock!");\n`,
      is_truncated: false,
    };
  }
  return await tauriInvoke<FileContentDto>("read_file_content", {
    projectId,
    relativePath,
  });
}

export async function onScanProgress(
  callback: (payload: ScanProgressPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return await tauriListen<ScanProgressPayload>("scan:progress", (event) => {
    callback(event.payload);
  });
}

export async function onScanComplete(
  callback: (payload: ScanCompletePayload) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return await tauriListen<ScanCompletePayload>("scan:complete", (event) => {
    callback(event.payload);
  });
}

export async function getFileSymbols(fileId: number): Promise<SymbolDto[]> {
  if (!isTauri()) return [];
  return await tauriInvoke<SymbolDto[]>("get_file_symbols", { fileId });
}

export async function listSymbols(
  projectId: number,
  filter?: ListSymbolsFilter,
): Promise<SymbolRecord[]> {
  if (!isTauri()) return [];
  return await tauriInvoke<SymbolRecord[]>("list_symbols", {
    projectId,
    fileId: filter?.file_id ?? null,
    kind: filter?.kind ?? null,
    language: filter?.language ?? null,
    pathPrefix: filter?.path_prefix ?? null,
    isExported: filter?.is_exported ?? null,
    minComplexity: filter?.min_complexity ?? null,
    hasErrorHandling: filter?.has_error_handling ?? null,
    hasSideEffects: filter?.has_side_effects ?? null,
    ftsQuery: filter?.fts_query ?? null,
    sortBy: filter?.sort_by ?? null,
    sortDirection: filter?.sort_direction ?? null,
    limit: filter?.limit ?? null,
    offset: filter?.offset ?? null,
  });
}

export async function getSymbolDetail(symbolId: number): Promise<SymbolDetail | null> {
  if (!isTauri()) return null;
  return await tauriInvoke<SymbolDetail | null>("get_symbol_detail", { symbolId });
}

export async function getClassDetail(symbolId: number): Promise<ClassDetailResponse | null> {
  if (!isTauri()) return null;
  return await tauriInvoke<ClassDetailResponse | null>("get_class_detail", { symbolId });
}

export async function getFileImports(fileId: number): Promise<ImportDto[]> {
  if (!isTauri()) return [];
  return await tauriInvoke<ImportDto[]>("get_file_imports", { fileId });
}

export async function startParse(
  projectId: number,
  concurrency?: number,
): Promise<void> {
  if (!isTauri()) return;
  return await tauriInvoke<void>("start_parse", { projectId, concurrency });
}

export async function cancelParse(): Promise<void> {
  if (!isTauri()) return;
  return await tauriInvoke<void>("cancel_parse");
}

export async function onParseProgress(
  callback: (payload: ParseProgressPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return await tauriListen<ParseProgressPayload>("parse:progress", (event) => {
    callback(event.payload);
  });
}

export async function onParseComplete(
  callback: (payload: ParseCompletePayload) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return await tauriListen<ParseCompletePayload>("parse:complete", (event) => {
    callback(event.payload);
  });
}

export async function getOverviewData(projectId: number): Promise<OverviewDataDto> {
  if (!isTauri()) {
    return {
      project_name: "Mock Project",
      root_path: "/mock/project",
      metrics: {
        total_files: 0,
        total_modules: 0,
        total_symbols: 0,
        total_functions: 0,
        total_classes: 0,
        total_entry_points: 0,
        total_dependencies: 0,
        unsupported_files_count: 0,
        partial_files_count: 0,
      },
      languages: [],
      frameworks: [],
      entry_points: [],
      modules: [],
      completion: null,
    };
  }
  return await tauriInvoke<OverviewDataDto>("get_overview_data", { projectId });
}

export async function getArchitectureModel(projectId: number): Promise<ArchitectureModel | null> {
  if (!isTauri()) return null;
  return await tauriInvoke<ArchitectureModel | null>("get_architecture_model", { projectId });
}

export async function analyzeArchitecture(projectId: number, projectPath: string): Promise<any> {
  if (!isTauri()) return null;
  return await tauriInvoke<any>("analyze_architecture", { projectId, projectPath });
}

export async function getDiagram(
  diagramType: DiagramType,
  projectId: number,
  options?: DiagramOptions
): Promise<DiagramResponse> {
  if (!isTauri()) {
    return {
      model: {
        diagram_type: diagramType,
        nodes: [],
        edges: [],
        groups: [],
      },
      dropped_edges: [],
      collapsed_overview: null,
    };
  }
  return await tauriInvoke<DiagramResponse>("get_diagram", {
    diagramType,
    projectId,
    options,
  });
}

export async function drillDown(
  groupId: string,
  projectId: number,
  diagramType?: DiagramType
): Promise<DrillDownResult> {
  if (!isTauri()) {
    return {
      group_id: groupId,
      nodes: [],
      edges: [],
    };
  }
  return await tauriInvoke<DrillDownResult>("drill_down", {
    groupId,
    projectId,
    diagramType,
  });
}




