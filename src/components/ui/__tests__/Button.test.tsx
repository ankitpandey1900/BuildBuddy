import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button";

describe("Button UI Primitive", () => {
  it("renders with focus-ring utility for :focus-visible only", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button.className).toContain("focus-ring");
  });

  it("renders primary variant correctly", () => {
    render(<Button variant="primary">Primary Action</Button>);
    const button = screen.getByRole("button", { name: "Primary Action" });
    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("text-white");
  });

  it("renders secondary variant correctly", () => {
    render(<Button variant="secondary">Secondary Action</Button>);
    const button = screen.getByRole("button", { name: "Secondary Action" });
    expect(button.className).toContain("bg-surface");
    expect(button.className).toContain("border-border-default");
  });

  it("renders plain variant correctly", () => {
    render(<Button variant="plain">Plain Action</Button>);
    const button = screen.getByRole("button", { name: "Plain Action" });
    expect(button.className).toContain("bg-transparent");
  });

  it("fires onClick handler when clicked", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
