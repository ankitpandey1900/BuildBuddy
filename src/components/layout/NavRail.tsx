import React from "react";
import {
  LayoutDashboard,
  FolderTree,
  GitGraph,
  Boxes,
  Network,
  Database,
  Code2,
  ShieldAlert,
  FileBarChart,
  BookOpen,
} from "lucide-react";
import type { ViewType } from "@/types/ipc";

interface NavRailProps {
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
}

interface NavItem {
  id: ViewType;
  label: string;
  icon: React.ReactNode;
}

export const NavRail: React.FC<NavRailProps> = ({ activeView, onSelectView }) => {
  const items: NavItem[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "explorer", label: "Explorer", icon: <FolderTree className="w-4 h-4" /> },
    { id: "architecture", label: "Architecture", icon: <GitGraph className="w-4 h-4" /> },
    { id: "dependencies", label: "Dependencies", icon: <Boxes className="w-4 h-4" /> },
    { id: "apis", label: "APIs", icon: <Network className="w-4 h-4" /> },
    { id: "database", label: "Database", icon: <Database className="w-4 h-4" /> },
    { id: "intelligence", label: "Code Intel", icon: <Code2 className="w-4 h-4" /> },
    { id: "security", label: "Security", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: "reports", label: "Reports", icon: <FileBarChart className="w-4 h-4" /> },
    { id: "documentation", label: "Documentation", icon: <BookOpen className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-12 bg-surface border-r border-border-default flex flex-col items-center py-2 select-none flex-shrink-0 z-30">
      <nav className="flex flex-col gap-1 w-full px-1.5" aria-label="Main Navigation">
        {items.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              title={item.label}
              aria-label={item.label}
              className={`w-9 h-9 mx-auto rounded-md flex items-center justify-center transition-colors focus-ring relative group ${
                isActive
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-text-muted hover:text-text-primary hover:bg-hover border border-transparent"
              }`}
            >
              {item.icon}
              {/* Tooltip on hover */}
              <span
                role="tooltip"
                className="absolute left-11 ml-1 px-2 py-0.5 bg-elevated border border-border-default text-text-primary text-micro font-sans rounded shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

