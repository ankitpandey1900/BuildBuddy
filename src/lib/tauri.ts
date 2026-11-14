import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, UnlistenFn } from "@tauri-apps/api/event";
import type { FileContentDto, FileRecord, Project, ScanCompletePayload, ScanProgressPayload } from "@/types/ipc";

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

