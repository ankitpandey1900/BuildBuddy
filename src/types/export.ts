export type ExportFormat = "svg" | "png" | "pdf" | "mermaid";

export interface ExportOptions {
  format: ExportFormat;
  scale?: number; // 2x or 3x for PNG high resolution
  theme?: "dark" | "light";
  direction?: "TD" | "LR";
  targetPath?: string;
}

export interface PathValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that an export output path does not write into the analyzed project directory.
 * Path matching is normalized for OS separators and case.
 */
export function validateExportPath(
  targetPath: string,
  projectRootPath: string | null | undefined
): PathValidationResult {
  if (!targetPath || !targetPath.trim()) {
    return { valid: false, error: "Target path must not be empty" };
  }

  if (!projectRootPath || !projectRootPath.trim()) {
    return { valid: true };
  }

  const normTarget = targetPath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const normRoot = projectRootPath.trim().replace(/\\/g, "/").replace(/\/+$/, "");

  // On Windows, paths are case-insensitive
  const targetLower = normTarget.toLowerCase();
  const rootLower = normRoot.toLowerCase();

  if (targetLower === rootLower || targetLower.startsWith(`${rootLower}/`)) {
    return {
      valid: false,
      error: `Security violation: Export path '${targetPath}' is inside analyzed project root '${projectRootPath}'. Exports must never write into the analyzed project.`,
    };
  }

  return { valid: true };
}

