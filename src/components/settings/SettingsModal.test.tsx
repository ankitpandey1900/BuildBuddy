import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal Component", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <SettingsModal
        isOpen={false}
        onClose={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders when isOpen is true with appearance, engine guarantees, and shortcuts", () => {
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    expect(screen.getByText("Workbench Settings")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Dark Mode")).toBeInTheDocument();
    expect(screen.getByText("Light Mode")).toBeInTheDocument();
    expect(screen.getByText("Engine Guarantees")).toBeInTheDocument();
    expect(screen.getByText("100% Offline Core:")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Navigation")).toBeInTheDocument();
  });

  it("toggles theme when clicking opposite theme button", () => {
    const handleToggle = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        theme="dark"
        onToggleTheme={handleToggle}
      />
    );

    const lightModeBtn = screen.getByText("Light Mode").closest("button")!;
    fireEvent.click(lightModeBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking Done or Close button", () => {
    const handleClose = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={handleClose}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
