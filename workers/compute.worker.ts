/// <reference lib="webworker" />
import { compute } from "@/lib/algorithm/compute";
import type { ComputeInput, WorkerOutMessage } from "@/lib/algorithm/types";

function post(message: WorkerOutMessage) {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = (event: MessageEvent<ComputeInput>) => {
  try {
    const result = compute(event.data, {
      onProgress: (phase, fraction) => post({ type: "progress", phase, fraction }),
    });
    post({ type: "result", result });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
