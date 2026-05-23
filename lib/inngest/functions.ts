import { inngest } from "@/lib/inngest/client";
import { ingestBook } from "@/lib/inngest/ingest-book";
import {
  recomputeLayoutByHue,
  recomputeLayoutClassical,
  recomputeLayoutModern,
} from "@/lib/inngest/recompute-layout";

export const ping = inngest.createFunction(
  {
    id: "ping",
    triggers: [{ event: "test/ping" }],
  },
  async ({ event, step }) => {
    return step.run("acknowledge", () => ({
      received: event.data,
      at: new Date().toISOString(),
    }));
  },
);

export const functions = [
  ping,
  ingestBook,
  recomputeLayoutClassical,
  recomputeLayoutByHue,
  recomputeLayoutModern,
];
