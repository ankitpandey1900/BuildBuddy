import React, { useState } from "react";
import { Info, ChevronDown, ChevronUp } from "lucide-react";

export const DiagramLegend: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 z-20 bg-surface/95 backdrop-blur-sm border border-border-default rounded shadow-sm text-xs font-mono max-w-xs transition-all">
      <button
        type="button"
        tabIndex={0}
        aria-label="Toggle diagram legend"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-hover rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
      >
        <div className="flex items-center space-x-1.5">
          <Info className="w-3.5 h-3.5 text-text-muted" />
          <span className="font-semibold text-[11px]">Legend & Styles</span>
        </div>
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-border-subtle space-y-2.5 text-[10px]">
          {/* Relationships */}
          <div>
            <div className="font-semibold text-text-primary mb-1 uppercase text-[9px] tracking-wider">
              Relationships
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-text-secondary">
              <div className="flex items-center space-x-1.5">
                <svg width="24" height="8" className="flex-shrink-0">
                  <line x1="0" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span>import</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <svg width="24" height="8" className="flex-shrink-0">
                  <line x1="0" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span>call</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <svg width="24" height="8" className="flex-shrink-0">
                  <line
                    x1="0"
                    y1="4"
                    x2="24"
                    y2="4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="4,3"
                  />
                </svg>
                <span>instantiation</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <svg width="24" height="8" className="flex-shrink-0">
                  <line x1="0" y1="4" x2="20" y2="4" stroke="currentColor" strokeWidth="1.5" />
                  <polygon points="20,1 24,4 20,7" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
                <span>inheritance</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <svg width="24" height="8" className="flex-shrink-0">
                  <line
                    x1="0"
                    y1="4"
                    x2="24"
                    y2="4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="2,3"
                  />
                </svg>
                <span>manifest dep</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <svg width="24" height="8" className="flex-shrink-0 text-accent-default">
                  <line x1="0" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="2.5" />
                </svg>
                <span>entry point</span>
              </div>
            </div>
          </div>

          {/* Confidence */}
          <div>
            <div className="font-semibold text-text-primary mb-1 uppercase text-[9px] tracking-wider">
              Confidence
            </div>
            <div className="space-y-1 text-text-secondary">
              <div className="flex items-center justify-between">
                <span>confirmed / static</span>
                <span className="text-text-muted">solid / syntax resolved</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <span>inferred</span>
                  <span className="px-1 py-0.2 bg-subtle border border-dashed rounded text-[8px] uppercase">
                    inferred
                  </span>
                </span>
                <span className="text-text-muted">dashed line</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <span>unknown</span>
                  <span className="px-1 py-0.2 bg-subtle border border-dotted rounded text-[8px] uppercase">
                    unknown
                  </span>
                </span>
                <span className="text-text-muted">dotted line</span>
              </div>
            </div>
          </div>

          {/* Node Types */}
          <div>
            <div className="font-semibold text-text-primary mb-1 uppercase text-[9px] tracking-wider">
              Node Domains
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-text-secondary">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-2 border-l-[#58A6FF] bg-surface border border-border-default" />
                <span>Frontend / File</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-2 border-l-[#3FB950] bg-surface border border-border-default" />
                <span>Backend / Module</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-2 border-l-[#D29922] bg-surface border border-border-default" />
                <span>Class / Model</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-2 border-l-[#BC8CFF] bg-surface border border-border-default" />
                <span>External Package</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SvgMarkerDefs: React.FC = () => (
  <svg style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, pointerEvents: "none" }}>
    <defs>
      <marker
        id="bb-arrow-default"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--text-muted, #8B949E)" />
      </marker>

      <marker
        id="bb-arrow-entry"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent-default, #388BFD)" />
      </marker>

      <marker
        id="bb-arrow-inheritance"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <polygon points="0,1 9,5 0,9" fill="var(--bg-surface, #161B22)" stroke="var(--text-secondary, #C9D1D9)" strokeWidth="1.5" />
      </marker>
    </defs>
  </svg>
);

