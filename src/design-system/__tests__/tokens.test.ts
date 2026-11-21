import { describe, it, expect } from "vitest";
import { colors, typography, spacing } from "../tokens";
import { Icons } from "../icons";

describe("Design System Tokens", () => {
  it("defines layered neutral palette for dark mode", () => {
    expect(colors.dark.canvas).toBe("#0C0C0E");
    expect(colors.dark.surface).toBe("#141416");
    expect(colors.dark.elevated).toBe("#1E1E22");
    expect(colors.dark.text.primary).toBe("#F5F5F7");
  });

  it("defines clean neutral palette for light mode", () => {
    expect(colors.light.canvas).toBe("#F5F5F7");
    expect(colors.light.surface).toBe("#FFFFFF");
    expect(colors.light.text.primary).toBe("#1D1D1F");
  });

  it("defines single restrained brand accent", () => {
    expect(colors.accent.default).toBe("#0A84FF");
    expect(colors.accent.text).toBe("#0A84FF");
  });

  it("defines all required provenance confidence tokens", () => {
    expect(colors.confidence.confirmed).toBeDefined();
    expect(colors.confidence.static).toBeDefined();
    expect(colors.confidence.inferred).toBeDefined();
    expect(colors.confidence.unknown).toBeDefined();
  });

  it("defines system typography scale", () => {
    expect(typography.fontSize.micro[0]).toBe("11px");
    expect(typography.fontSize.caption[0]).toBe("12px");
    expect(typography.fontSize.body[0]).toBe("13px");
    expect(typography.fontSize.subheading[0]).toBe("15px");
    expect(typography.fontSize.heading[0]).toBe("20px");
    expect(typography.fontSize.display[0]).toBe("28px");
  });

  it("defines 4px spacing grid and controlled radii", () => {
    expect(spacing.grid).toBe(4);
    expect(spacing.radius.sm).toBe("6px");
    expect(spacing.radius.md).toBe("10px");
    expect(spacing.radius.lg).toBe("14px");
  });

  it("maps core icons consistently without emojis", () => {
    expect(Icons.overview).toBeDefined();
    expect(Icons.explorer).toBeDefined();
    expect(Icons.architecture).toBeDefined();
    expect(Icons.dependencies).toBeDefined();
    expect(Icons.intelligence).toBeDefined();
    expect(Icons.apis).toBeDefined();
    expect(Icons.database).toBeDefined();
    expect(Icons.security).toBeDefined();
    expect(Icons.reports).toBeDefined();
    expect(Icons.documentation).toBeDefined();
    expect(Icons.settings).toBeDefined();
  });
});
