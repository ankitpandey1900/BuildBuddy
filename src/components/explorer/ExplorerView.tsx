import React from "react";
import { FileTree } from "./FileTree";
import { SourceViewer } from "@/components/viewer/SourceViewer";
import type { FileContentDto, FileRecord } from "@/types/ipc";

interface ExplorerViewProps {
  files: FileRecord[];
  selectedFile: FileRecord | null;
  fileContent: FileContentDto | null;
  isLoadingContent: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  languageFilter: string;
  onLanguageFilterChange: (lang: string) => void;
  onSelectFile: (file: FileRecord) => void;
  onOpenFolder: () => void;
  theme: "dark" | "light";
  targetLine?: number | null;
}

export const ExplorerView: React.FC<ExplorerViewProps> = ({
  files,
  selectedFile,
  fileContent,
  isLoadingContent,
  searchQuery,
  onSearchChange,
  languageFilter,
  onLanguageFilterChange,
  onSelectFile,
  onOpenFolder,
  theme,
  targetLine,
}) => {
  const handleSelectByPath = (filePath: string) => {
    const target = files.find((f) => f.relative_path === filePath);
    if (target) {
      onSelectFile(target);
    }
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <FileTree
        files={files}
        selectedFile={selectedFile}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        languageFilter={languageFilter}
        onLanguageFilterChange={onLanguageFilterChange}
        onSelectFile={onSelectFile}
        onOpenFolder={onOpenFolder}
      />

      <SourceViewer
        selectedFile={selectedFile}
        fileContent={fileContent}
        isLoading={isLoadingContent}
        theme={theme}
        targetLine={targetLine}
        onSelectFileByPath={handleSelectByPath}
      />
    </div>
  );
};

