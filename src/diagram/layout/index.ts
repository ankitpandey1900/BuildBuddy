import type { DiagramModel, PositionedModel } from "../../types/diagram";
import { layout } from "./engine";
import type { LayoutOptions, LayoutWorkerRequest, LayoutWorkerResponse } from "./types";

export { layout } from "./engine";
export * from "./types";

/**
 * Controller for running layout calculations inside a cancellable Web Worker.
 */
export class LayoutWorkerClient {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (model: PositionedModel) => void;
      reject: (err: Error) => void;
    }
  >();
  private requestCounter = 0;

  constructor() {
    if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      try {
        this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
          type: "module",
        });
        this.worker.onmessage = this.handleMessage.bind(this);
      } catch (e) {
        // Fallback to direct layout in environments where Worker constructor fails
        this.worker = null;
      }
    }
  }

  private handleMessage(event: MessageEvent<LayoutWorkerResponse>) {
    const data = event.data;
    const pending = this.pendingRequests.get(data.id);
    if (!pending) return;

    this.pendingRequests.delete(data.id);

    if (data.type === "success") {
      pending.resolve(data.model);
    } else if (data.type === "cancelled") {
      pending.reject(new Error("Layout calculation was cancelled"));
    } else if (data.type === "error") {
      pending.reject(new Error(data.error));
    }
  }

  /**
   * Request a layout calculation. Returns a Promise and a cancel() function.
   */
  public calculate(
    model: DiagramModel,
    options?: LayoutOptions
  ): { promise: Promise<PositionedModel>; cancel: () => void } {
    const id = `layout_req_${++this.requestCounter}`;

    if (!this.worker) {
      // Direct synchronous execution fallback
      let cancelled = false;
      const promise = (async () => {
        const res = await layout(model, options);
        if (cancelled) {
          throw new Error("Layout calculation was cancelled");
        }
        return res;
      })();

      return {
        promise,
        cancel: () => {
          cancelled = true;
        },
      };
    }

    const promise = new Promise<PositionedModel>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const msg: LayoutWorkerRequest = {
        type: "layout",
        id,
        model,
        options,
      };
      this.worker!.postMessage(msg);
    });

    const cancel = () => {
      if (this.pendingRequests.has(id)) {
        const msg: LayoutWorkerRequest = {
          type: "cancel",
          id,
        };
        this.worker?.postMessage(msg);
      }
    };

    return { promise, cancel };
  }

  public terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.pendingRequests.clear();
  }
}
