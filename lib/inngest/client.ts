import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "inklings",
  // Treat anything that isn't an explicit production build as dev mode so
  // local scripts (`tsx scripts/...`) and dev pages talk to the local
  // Inngest dev server (default http://localhost:8288). On Vercel,
  // NODE_ENV is "production" and the SDK uses INNGEST_EVENT_KEY.
  isDev: process.env.NODE_ENV !== "production",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
