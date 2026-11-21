import React from "react";
import {
  X,
  Sun,
  Moon,
  Cpu,
  Lock,
  Database,
} from "lucide-react";
import { Button } from "@/design-system/components/Button";
import { Badge } from "@/design-system/components/Badge";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

const SHORTCUTS = [
  { key: "⌘ K / Ctrl+K", action: "Open Command Palette" },
  { key: "⌘ B / Ctrl+B", action: "Toggle Sidebar Rail" },
  { key: "⌘ I / Ctrl+I", action: "Toggle Inspector Panel" },
  { key: "Esc", action: "Close Dialog / Palette / Drawer" },
  { key: "↑ / ↓", action: "Navigate Lists & Trees" },
  { key: "Enter", action: "Select / Open Item" },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onToggleTheme,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-none animate-in fade-in-0 duration-150"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg bg-surface border border-border-default rounded-md shadow-modal overflow-hidden z-10 font-sans">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 id="settings-title" className="text-subheading font-semibold text-text-primary">
              Workbench Settings
            </h2>
            <Badge variant="neutral" size="sm">
              v0.1.0
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-hover focus-ring"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Appearance Section */}
          <div>
            <h3 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-2.5">
              Appearance
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (theme !== "dark") onToggleTheme();
                }}
                className={`flex items-center gap-2.5 p-3 rounded-sm border text-left transition-colors cursor-pointer ${
                  theme === "dark"
                    ? "border-border-strong bg-elevated text-text-primary font-medium"
                    : "border-border-default bg-surface hover:bg-hover text-text-secondary"
                }`}
              >
                <Moon className="w-4 h-4" />
                <div>
                  <div className="text-body font-medium">Dark Mode</div>
                  <div className="text-micro text-text-muted">Layered charcoal surfaces</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (theme !== "light") onToggleTheme();
                }}
                className={`flex items-center gap-2.5 p-3 rounded-sm border text-left transition-colors cursor-pointer ${
                  theme === "light"
                    ? "border-border-strong bg-elevated text-text-primary font-medium"
                    : "border-border-default bg-surface hover:bg-hover text-text-secondary"
                }`}
              >
                <Sun className="w-4 h-4" />
                <div>
                  <div className="text-body font-medium">Light Mode</div>
                  <div className="text-micro text-text-muted">Clean neutral surfaces</div>
                </div>
              </button>
            </div>
          </div>

          {/* Engine Guarantees */}
          <div>
            <h3 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-2.5">
              Engine Guarantees
            </h3>
            <div className="space-y-2 border border-border-subtle rounded p-3 bg-subtle/50 text-caption text-text-secondary">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-status-success-text" />
                <span className="font-medium text-text-primary">100% Offline Core:</span>
                <span>Zero outbound network telemetry or cloud API calls.</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-status-success-text" />
                <span className="font-medium text-text-primary">Read-Only Analysis:</span>
                <span>Target repository source files are never mutated.</span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-status-success-text" />
                <span className="font-medium text-text-primary">SQLite FTS5 + Blake3:</span>
                <span>Local deterministic caching and instant full-text symbol search.</span>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div>
            <h3 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-2.5">
              Keyboard Navigation
            </h3>
            <div className="border border-border-default rounded overflow-hidden divide-y divide-border-subtle text-caption">
              {SHORTCUTS.map((sc) => (
                <div key={sc.key} className="flex items-center justify-between px-3 py-2 bg-surface">
                  <span className="text-text-secondary">{sc.action}</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-subtle border border-border-default font-mono text-micro text-text-primary">
                    {sc.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-subtle bg-subtle/30 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
