import React, { useState } from "react";
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
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import type { ViewType } from "@/types/ipc";
import { Tooltip } from "@/components/ui/Tooltip";

export interface NavRailProps {
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItem {
  id: ViewType;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Explore",
    items: [
      { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
      { id: "explorer", label: "Explorer", icon: <FolderTree className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
    ],
  },
  {
    title: "Analyze",
    items: [
      { id: "architecture", label: "Architecture", icon: <GitGraph className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
      { id: "dependencies", label: "Dependencies", icon: <Boxes className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
      { id: "intelligence", label: "Code Intel", icon: <Code2 className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
      { id: "apis", label: "APIs", icon: <Network className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
      { id: "database", label: "Database", icon: <Database className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
    ],
  },
  {
    title: "Document",
    items: [
      { id: "documentation", label: "Documentation", icon: <BookOpen className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
      { id: "security", label: "Security", icon: <ShieldAlert className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
      { id: "reports", label: "Reports", icon: <FileBarChart className="w-[18px] h-[18px]" strokeWidth={2.1} /> },
    ],
  },
];

export const NavRail: React.FC<NavRailProps> = ({
  activeView,
  onSelectView,
  isCollapsed: controlledCollapsed,
  onToggleCollapse: controlledToggle,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const toggleCollapse = controlledToggle || (() => setInternalCollapsed((prev) => !prev));

  return (
    <aside
      aria-label="Main Navigation Sidebar"
      data-testid="app-sidebar"
      className={`bg-surface border-r border-border-default flex flex-col justify-between py-2 select-none flex-shrink-0 z-30 transition-all duration-150 ease-out ${
        isCollapsed ? "w-14" : "w-60"
      }`}
    >
      {/* Top Brand Logo / Header */}
      <div className={`flex items-center px-3 pb-2 mb-2 border-b border-border-subtle ${isCollapsed ? "justify-center" : "justify-between"}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-elevated border border-border-default flex items-center justify-center flex-shrink-0 text-text-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs tracking-tight text-text-primary leading-none">BuildBuddy</span>
              <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider mt-0.5">Workbench</span>
            </div>
          )}
        </div>
      </div>

      {/* Groups & Navigation Items */}
      <nav className="flex flex-col gap-4 px-2 w-full overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            {/* Group Title (hidden when collapsed) */}
            {!isCollapsed && (
              <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted select-none">
                {group.title}
              </div>
            )}

            {/* Group Items */}
            {group.items.map((item) => {
              const isActive = activeView === item.id;

              const buttonElement = (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full flex items-center rounded-md transition-colors duration-150 ease-out focus-ring cursor-pointer ${
                    isCollapsed
                      ? "h-9 justify-center px-0"
                      : "h-9 px-2.5 gap-3 text-left"
                  } ${
                    isActive
                      ? "bg-neutral-800 text-white dark:bg-[#27272a] dark:text-white font-medium shadow-xs"
                      : "text-text-secondary hover:text-text-primary hover:bg-hover font-normal"
                  }`}
                >
                  <span className={`flex-shrink-0 flex items-center justify-center ${isActive ? "text-white" : "text-text-muted"}`}>
                    {item.icon}
                  </span>
                  {!isCollapsed && (
                    <span className="truncate text-subheading leading-none">{item.label}</span>
                  )}
                </button>
              );

              if (isCollapsed) {
                return (
                  <Tooltip key={item.id} content={item.label} side="right">
                    {buttonElement}
                  </Tooltip>
                );
              }

              return buttonElement;
            })}
          </div>
        ))}
      </nav>

      {/* Collapse / Expand Toggle Button at Bottom */}
      <div className="pt-2 border-t border-border-subtle px-1.5 flex items-center">
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`w-full h-9 flex items-center rounded-sm hover:bg-hover text-text-muted hover:text-text-primary transition-colors duration-150 focus-ring cursor-pointer ${
            isCollapsed ? "justify-center" : "px-2.5 gap-2"
          }`}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeft className="w-4 h-4 flex-shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
              <span className="text-caption truncate">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
