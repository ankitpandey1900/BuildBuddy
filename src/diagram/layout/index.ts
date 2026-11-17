import type { DiagramModel, PositionedModel } from "../../types/diagram";
import type { LayoutOptions, LayoutWorkerRequest, LayoutWorkerResponse } from "./types";

export * from "./types";

export type WorkerFactory = () => Worker;

/**
 * Controller for running layout calculations inside a cancellable Web Worker.
 * When cancelled, worker.terminate() is invoked to immediately kill the worker
 * thread and stop CPU execution, and a fresh worker is re-spawned for future jobs.
 */
export class LayoutWorkerClient {
  private worker: Worker | null = null;
  private workerFactory: WorkerFactory | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (model: PositionedModel) => void;
      reject: (err: Error) => void;
    }
  >();
  private requestCounter = 0;

  constructor(workerFactory?: WorkerFactory) {
    if (workerFactory) {
      this.workerFactory = workerFactory;
    } else if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      this.workerFactory = () =>
        new Worker(new URL("./worker.ts", import.meta.url), {
          type: "module",
        });
    }

    this.initWorker();
  }

  private initWorker() {
    if (!this.workerFactory) {
      this.worker = null;
      return;
    }

    try {
      this.worker = this.workerFactory();
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = (err) => {
        console.error("Layout worker encountered an error:", err);
        for (const [, pending] of this.pendingRequests.entries()) {
          pending.reject(new Error(err?.message || "Layout worker thread failed"));
        }
        this.pendingRequests.clear();
      };
    } catch {
      this.worker = null;
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
   * Calling cancel() calls worker.terminate() to abort execution immediately
   * and recreates a new worker instance.
   */
  public calculate(
    model: DiagramModel,
    options?: LayoutOptions
  ): { promise: Promise<PositionedModel>; cancel: () => void } {
    const id = `layout_req_${++this.requestCounter}`;

    if (!this.worker) {
      // Dynamic fallback when Web Worker is unavailable (e.g. some node environments)
      let cancelled = false;
      const promise = (async () => {
        const { layout } = await import("./engine");
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
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        pending.reject(new Error("Layout calculation was cancelled"));

        // Force termination of the Web Worker OS thread to halt ELK computation immediately
        if (this.worker) {
          this.worker.terminate();
          this.initWorker();
        }
      }
    };

    return { promise, cancel };
  }

  public terminate() {
    this.worker?.terminate();
    this.worker = null;
    for (const [, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error("LayoutWorkerClient terminated"));
    }
    this.pendingRequests.clear();
  }
}
