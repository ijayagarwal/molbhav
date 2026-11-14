import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp();

app.use(rateLimiter);
// Three pools (DECISIONS B4, R2). Their parallelism and retries are set in convex/pools.ts (Phase 5).
app.use(workpool, { name: "dialPool" });
app.use(workpool, { name: "llmPool" });
app.use(workpool, { name: "mediaPool" });

export default app;
