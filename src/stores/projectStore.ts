import { useState, useEffect, useCallback } from "react";
import type { FileContentDto, FileRecord, Project, ScanCompletePayload, ScanProgressPayload } from "@/types/ipc";
import {
  cancelScan,
  getFiles,
  getRecentProjects,
  onScanComplete,
  onScanProgress,
  openProjectByPath,
  readFileContent,
  selectAndOpenProject,
  startScan,
} from "@/lib/tauri";

export function useProjectState() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [fileContent, setFileContent] = useState<FileContentDto | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgressPayload | null>(null);
  const [scanSummary, setScanSummary] = useState<ScanCompletePayload | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState<string>("all");

  const refreshRecent = useCallback(async () => {
    try {
      const recents = await getRecentProjects();
      setRecentProjects(recents);
    } catch (e) {
      console.error("Failed to load recent projects", e);
    }
  }, []);

  const refreshFiles = useCallback(async (projectId: number, search?: string, ext?: string) => {
    try {
      const records = await getFiles(projectId, search, ext);
      setFiles(records);
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
  }, []);

  const openFolder = useCallback(async () => {
    try {
      const proj = await selectAndOpenProject();
      if (proj) {
        setCurrentProject(proj);
        setSelectedFile(null);
        setFileContent(null);
        await refreshRecent();
        // Automatically start initial scan
        setIsScanning(true);
        await startScan(proj.id);
      }
    } catch (e) {
      console.error("Failed to open project folder", e);
    }
  }, [refreshRecent]);

  const reopenProject = useCallback(async (path: string) => {
    try {
      const proj = await openProjectByPath(path);
      setCurrentProject(proj);
      setSelectedFile(null);
      setFileContent(null);
      await refreshRecent();
      await refreshFiles(proj.id);
    } catch (e) {
      console.error("Failed to reopen project", e);
    }
  }, [refreshRecent, refreshFiles]);

  const triggerScan = useCallback(async () => {
    if (!currentProject) return;
    setIsScanning(true);
    setScanProgress(null);
    setScanSummary(null);
    try {
      await startScan(currentProject.id);
    } catch (e) {
      console.error("Failed to start scan", e);
      setIsScanning(false);
    }
  }, [currentProject]);

  const abortScan = useCallback(async () => {
    try {
      await cancelScan();
    } catch (e) {
      console.error("Failed to cancel scan", e);
    }
  }, []);

  const selectFile = useCallback(async (file: FileRecord) => {
    setSelectedFile(file);
    if (!currentProject) return;
    setIsLoadingContent(true);
    try {
      const content = await readFileContent(currentProject.id, file.relative_path);
      setFileContent(content);
    } catch (e) {
      console.error("Failed to read file content", e);
      setFileContent({
        file_name: file.file_name,
        relative_path: file.relative_path,
        extension: file.extension,
        size_bytes: file.size_bytes,
        content: `Error loading file: ${e}`,
        is_truncated: false,
      });
    } finally {
      setIsLoadingContent(false);
    }
  }, [currentProject]);

  // Initial load of recent projects
  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  // Setup event listeners for background scanning
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    onScanProgress((payload) => {
      setScanProgress(payload);
    }).then((unlisten) => {
      unlistenProgress = unlisten;
    });

    onScanComplete((payload) => {
      setIsScanning(false);
      setScanSummary(payload);
      if (currentProject && payload.project_id === currentProject.id) {
        refreshFiles(currentProject.id, searchQuery, languageFilter);
      }
    }).then((unlisten) => {
      unlistenComplete = unlisten;
    });

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
    };
  }, [currentProject, refreshFiles, searchQuery, languageFilter]);

  // Filter re-query
  useEffect(() => {
    if (currentProject) {
      refreshFiles(currentProject.id, searchQuery, languageFilter);
    }
  }, [currentProject, searchQuery, languageFilter, refreshFiles]);

  return {
    currentProject,
    recentProjects,
    files,
    selectedFile,
    fileContent,
    isLoadingContent,
    isScanning,
    scanProgress,
    scanSummary,
    searchQuery,
    setSearchQuery,
    languageFilter,
    setLanguageFilter,
    openFolder,
    reopenProject,
    triggerScan,
    abortScan,
    selectFile,
    refreshFiles,
  };
}

