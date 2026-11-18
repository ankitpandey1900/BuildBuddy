import { test, expect, type Page } from "@playwright/test";

const outputDir = "docs/screenshots/d2";

const project = {
  id: 1,
  name: "arch-react-express",
  root_path: "C:/fixtures/arch-react-express",
  created_at: "2026-11-17T12:00:00Z",
  updated_at: "2026-11-17T12:00:00Z",
  settings_json: "{}",
};

const files = Array.from({ length: 1500 }, (_, index) => ({
  id: index + 1,
  project_id: 1,
  file_name: index === 0 ? "main.ts" : `module-${index}.ts`,
  relative_path: index === 0 ? "src/main.ts" : `src/features/feature-${index % 20}/module-${index}.ts`,
  extension: "ts",
  language_id: 1,
  size_bytes: 480 + index,
  line_count: 20 + (index % 180),
  function_count: 1 + (index % 5),
  class_count: index % 6 === 0 ? 1 : 0,
  import_count: index % 7,
  content_hash: `fixture-${index}`,
  status: "parsed",
  updated_at: "2026-11-17T12:00:00Z",
}));

const symbols = files.slice(0, 80).map((file, index) => ({
  id: index + 1,
  project_id: 1,
  file_id: file.id,
  file_path: file.relative_path,
  stable_id: `symbol-${index}`,
  name: index === 0 ? "bootstrap" : `featureHandler${index}`,
  qualified_name: `fixture.${index === 0 ? "bootstrap" : `featureHandler${index}`}`,
  kind: index % 10 === 0 ? "class" : "function",
  parent_name: null,
  signature: `function featureHandler${index}(): void`,
  return_type: "void",
  visibility: "public",
  is_exported: true,
  is_async: index % 2 === 0,
  docstring: "Fixture symbol used for UI verification.",
  start_line: 4,
  end_line: 18,
  start_column: 1,
  end_column: 32,
  confidence: index % 5 === 0 ? "inferred" : "static",
  complexity: 1 + (index % 12),
  has_error_handling: index % 2 === 0,
  has_side_effects: index % 3 === 0,
  callers: [],
  callees: [],
}));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ fixtureProject, fixtureFiles, fixtureSymbols }) => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        switch (command) {
          case "get_recent_projects": return [fixtureProject];
          case "select_and_open_project": return fixtureProject;
          case "get_files": return fixtureFiles;
          case "start_scan": return 1;
          case "read_file_content": return {
            file_name: "main.ts", relative_path: "src/main.ts", extension: "ts", size_bytes: 400,
            content: "export function bootstrap() { return startServer(); }", is_truncated: false,
          };
          case "get_overview_data": return {
            project_name: fixtureProject.name,
            root_path: fixtureProject.root_path,
            metrics: { total_files: 1500, total_modules: 20, total_symbols: 80, total_functions: 72, total_classes: 8, total_entry_points: 2, total_dependencies: 34, unsupported_files_count: 0, partial_files_count: 0 },
            languages: [{ language: "TypeScript", file_count: 1120, percentage: 74.7 }, { language: "JavaScript", file_count: 380, percentage: 25.3 }],
            frameworks: [{ name: "React", confidence: "static", evidence: ["package.json:10-10:manifest_entry"] }, { name: "Express", confidence: "static", evidence: ["package.json:11-11:manifest_entry"] }],
            entry_points: [{ file_path: "src/main.ts", line: 1, evidence_key: "src/main.ts:1-1:entry_point" }],
            modules: [{ name: "frontend", file_count: 700, layer: "frontend" }, { name: "backend", file_count: 500, layer: "backend" }],
            completion: { status: "completed", duration_ms: 1840, files_scanned: 1500, files_parsed: 1500 },
          };
          case "list_symbols": return fixtureSymbols;
          case "get_dependencies_overview": return { internal_edges_count: 196, external_dependencies_count: 34, unused_dependencies_count: 2 };
          case "get_import_edges": return [{ source_file_id: 1, source_file_path: "src/main.ts", target_file_id: 2, target_file_path: "src/features/feature-1/module-1.ts", target_module: "./features/feature-1/module-1", imported_name: "featureHandler1", is_type_only: false, line_number: 1, resolution_status: "internal", source_evidence_id: 1 }, { source_file_id: 1, source_file_path: "src/main.ts", target_file_id: null, target_file_path: null, target_module: "react", imported_name: "useEffect", is_type_only: false, line_number: 2, resolution_status: "external", source_evidence_id: 2 }];
          case "get_circular_dependencies": return [];
          case "get_git_status": return { is_git_repo: true, current_branch: "main", commit_hash: "1a2b3c4d" };
          default: return null;
        }
      },
      event: { listen: async () => () => {} },
    };
  }, { fixtureProject: project, fixtureFiles: files, fixtureSymbols: symbols });
  await page.goto("/");
  await page.getByRole("button", { name: "Open Project" }).first().click();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
});

test.setTimeout(120_000);

async function capture(page: Page, screen: string) {
  for (const [width, height] of [[1280, 800], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    for (const theme of ["dark", "light"] as const) {
      if (theme === "light") {
        await page.getByRole("button", { name: "Toggle theme" }).click();
      }
      await page.screenshot({ path: `${outputDir}/${screen}-${width}x${height}-${theme}.png`, fullPage: false });
      if (theme === "light") {
        await page.getByRole("button", { name: "Toggle theme" }).click();
      }
    }
  }
}

for (const [screen, navigation, ready] of [["overview", "Overview", "arch-react-express"], ["explorer", "Explorer", "main.ts"], ["dependencies", "Dependencies", "Dependencies"], ["code-intelligence", "Code Intel", "80 symbols"]] as const) {
  test(`captures ${screen} at required viewports and themes`, async ({ page }) => {
    await page.getByRole("button", { name: navigation }).click();
    await expect(page.getByText(ready).first()).toBeVisible();
    await capture(page, screen);
  });
}

test("captures the selected-file inspector at required viewports and themes", async ({ page }) => {
  await page.getByRole("button", { name: "Explorer" }).click();
  await page.getByText("main.ts").click();
  await expect(page.getByText("src / main.ts")).toBeVisible();
  await capture(page, "inspector");
});
