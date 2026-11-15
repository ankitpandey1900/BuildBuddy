import { describe, expect, it } from "vitest";
import { validateExportPath } from "../../../types/export";
import { serializeToSvg, serializeToPng } from "../image";

describe("Export Path Validation", () => {
  const projectRoot = "D:/Projects/MyAnalyzedApp";

  it("permits export paths outside the analyzed project directory", () => {
    const validPaths = [
      "D:/Exports/architecture.png",
      "C:/Users/Developer/Desktop/diagram.svg",
      "D:/Projects/OtherApp/doc.pdf",
    ];

    for (const p of validPaths) {
      const res = validateExportPath(p, projectRoot);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    }
  });

  it("strictly forbids export paths inside the analyzed project directory", () => {
    const forbiddenPaths = [
      "D:/Projects/MyAnalyzedApp/diagram.png",
      "D:/Projects/MyAnalyzedApp/docs/architecture.svg",
      "d:/projects/myanalyzedapp/src/assets/graph.png", // case-insensitive check
      "D:\\Projects\\MyAnalyzedApp\\out.pdf", // windows separator check
    ];

    for (const p of forbiddenPaths) {
      const res = validateExportPath(p, projectRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Security violation");
    }
  });

  it("rejects empty target paths", () => {
    const res = validateExportPath("", projectRoot);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("must not be empty");
  });
});

describe("Image Serializers", () => {
  it("serializes an element to SVG string", () => {
    const div = document.createElement("div");
    div.innerHTML = `<span id="test-node">Node Content</span>`;
    const svgStr = serializeToSvg(div, { theme: "dark" });

    expect(svgStr).toContain("<svg");
    expect(svgStr).toContain("xmlns=\"http://www.w3.org/2000/svg\"");
    expect(svgStr).toContain("Node Content");
  });

  it("throws security error when exporting image to project root path", async () => {
    const div = document.createElement("div");
    const insidePath = "D:/MyProject/exports/diagram.svg";
    const projectRoot = "D:/MyProject";

    expect(() => {
      serializeToSvg(div, {
        targetPath: insidePath,
        projectRootPath: projectRoot,
      });
    }).toThrow("Security violation");

    await expect(
      serializeToPng(div, {
        targetPath: insidePath,
        projectRootPath: projectRoot,
      })
    ).rejects.toThrow("Security violation");
  });
});

