import { inngest } from "@/lib/inngest/client";

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

export const functions = [ping];
