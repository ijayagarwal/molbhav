import { initBotId } from "botid/client/core";

// Vercel BotID (ARCHITECTURE §7): attaches the challenge headers to these requests so checkBotId() in the
// routes can classify them. A route missing here fails checkBotId(). On Vercel no next.config wrapper or
// rewrites are needed; in local dev checkBotId() always passes.
initBotId({
  protect: [
    { path: "/api/voice/order", method: "POST" },
    { path: "/api/tts", method: "POST" },
    // /dealer's server actions post to the page itself; the number check asks checkBotId() (R25).
    { path: "/dealer", method: "POST" },
  ],
});
