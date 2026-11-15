import { layout } from "./engine";
import type { LayoutWorkerRequest, LayoutWorkerResponse } from "./types";

const activeJobs = new Set<string>();

self.onmessage = async (event: MessageEvent<LayoutWorkerRequest>) => {
  const message = event.data;

  if (message.type === "cancel") {
    activeJobs.delete(message.id);
    const response: LayoutWorkerResponse = {
      type: "cancelled",
      id: message.id,
    };
    self.postMessage(response);
    return;
  }

  if (message.type === "layout") {
    const { id, model, options } = message;
    activeJobs.add(id);

    try {
      const result = await layout(model, options);

      // If job was cancelled while layout was computing, do not emit success
      if (!activeJobs.has(id)) {
        return;
      }
      activeJobs.delete(id);

      const response: LayoutWorkerResponse = {
        type: "success",
        id,
        model: result,
      };
      self.postMessage(response);
    } catch (err: any) {
      if (!activeJobs.has(id)) {
        return;
      }
      activeJobs.delete(id);

      const response: LayoutWorkerResponse = {
        type: "error",
        id,
        error: err?.message || String(err),
      };
      self.postMessage(response);
    }
  }
};
