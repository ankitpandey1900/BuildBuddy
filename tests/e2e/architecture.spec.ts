import { test, expect } from "@playwright/test";

test.describe("Architecture Screen E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Mock Tauri IPC invoke layer before page loads
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args: any) => {
          if (cmd === "get_projects") {
            return [
              {
                id: 1,
                name: "arch-react-express",
                root_path: "/fixtures/arch-react-express",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                settings_json: "{}",
              },
            ];
          }
          if (cmd === "get_active_project" || cmd === "select_and_open_project" || cmd === "open_project_by_path") {
            return {
              id: 1,
              name: "arch-react-express",
              root_path: "/fixtures/arch-react-express",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              settings_json: "{}",
            };
          }
          if (cmd === "get_overview_data") {
            return {
              counts: { total_files: 10, total_modules: 2, total_symbols: 15, unclassified_files: 0 },
              languages: [{ language: "TypeScript", file_count: 8, percentage: 80.0 }],
              frameworks: [],
              entry_points: [],
              modules: [],
              completion: { status: "complete", analyzed_files: 10, total_files: 10, error_count: 0 },
            };
          }
          if (cmd === "get_diagram") {
            return {
              model: {
                diagram_type: args?.diagramType || "architecture_overview",
                nodes: [
                  {
                    id: "file:src/index.ts",
                    kind: "file",
                    label: "index.ts",
                    x: 100,
                    y: 100,
                    width: 180,
                    height: 40,
                    source_ref: { file_path: "src/index.ts", start_line: 1, end_line: 25 },
                  },
                  {
                    id: "file:src/App.tsx",
                    kind: "component",
                    label: "App.tsx",
                    x: 350,
                    y: 100,
                    width: 200,
                    height: 50,
                    source_ref: { file_path: "src/App.tsx", start_line: 5, end_line: 50 },
                  },
                ],
                edges: [
                  {
                    id: "edge:1",
                    from: "file:src/index.ts",
                    to: "file:src/App.tsx",
                    relationship: "import",
                    confidence: "static",
                    evidence_id: 101,
                    evidence_key: "src/index.ts:1-1:import_stmt",
                    label: "imports",
                  },
                ],
                groups: [],
              },
              dropped_edges: [],
              collapsed_overview: null,
            };
          }
          return null;
        },
        plugins: {},
      };
    });
  });

  test("loads architecture view and displays toolbar and canvas", async ({ page }) => {
    await page.goto("/");
    // Click on Architecture in navigation
    const archTab = page.locator("button, a").filter({ hasText: /^Architecture$/ });
    if (await archTab.count() > 0) {
      await archTab.first().click();
    }

    // Verify architecture screen container is present
    await expect(page.locator('[data-testid="architecture-screen"]')).toBeVisible();

    // Verify diagram selector dropdown is present
    const typeSelect = page.locator('select[aria-label="Diagram Type"]');
    await expect(typeSelect).toBeVisible();

    // Verify toolbar filter button
    const filterBtn = page.locator('button[aria-label="Toggle diagram filters"]');
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // Verify filter panel is visible
    await expect(page.getByText("Relationship Types")).toBeVisible();
    await expect(page.getByText("Confidence Levels")).toBeVisible();

    // Toggle filter panel close
    const closeFilterBtn = page.locator('button[aria-label="Close filter panel"]');
    await closeFilterBtn.click();
    await expect(page.getByText("Relationship Types")).not.toBeVisible();

    // Verify Legend button
    const legendBtn = page.locator('button[aria-label="Toggle diagram legend"]');
    if (await legendBtn.count() > 0) {
      await legendBtn.click();
      await expect(page.getByText("RELATIONSHIPS")).toBeVisible();
      await expect(page.getByText("CONFIDENCE")).toBeVisible();
    }
  });

  test("allows switching diagram types", async ({ page }) => {
    await page.goto("/");
    const archTab = page.locator("button, a").filter({ hasText: /^Architecture$/ });
    if (await archTab.count() > 0) {
      await archTab.first().click();
    }

    const typeSelect = page.locator('select[aria-label="Diagram Type"]');
    await expect(typeSelect).toBeVisible();

    await typeSelect.selectOption("module_dependency");
    await expect(typeSelect).toHaveValue("module_dependency");

    await typeSelect.selectOption("class_diagram");
    await expect(typeSelect).toHaveValue("class_diagram");
  });
});
