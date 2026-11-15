import type { DiagramModel, PositionedModel } from "../../types/diagram";

export type LayoutDirection = "DOWN" | "RIGHT";
export type LayoutPreset = "layered" | "compact" | "spacious";

export interface LayoutOptions {
  direction?: LayoutDirection;
  preset?: LayoutPreset;
  nodeSpacing?: number;
  edgeSpacing?: number;
  groupPadding?: number;
}

export type LayoutWorkerRequest =
  | {
      type: "layout";
      id: string;
      model: DiagramModel;
      options?: LayoutOptions;
    }
  | {
      type: "cancel";
      id: string;
    };

export type LayoutWorkerResponse =
  | {
      type: "success";
      id: string;
      model: PositionedModel;
    }
  | {
      type: "error";
      id: string;
      error: string;
    }
  | {
      type: "cancelled";
      id: string;
    };
