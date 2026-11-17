import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { bolnaReportQuote, bolnaWebhook, webCallPreflight, webCallSession } from "./bolnaHttp";
import { REC_PATH_PREFIX, serveRecording } from "./mediaHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

// Bolna (ARCHITECTURE §6.3, §7): each route checks its own secret or the caller's admin session.
http.route({ path: "/bolna/webhook", method: "POST", handler: bolnaWebhook });
http.route({ path: "/bolna/report-quote", method: "POST", handler: bolnaReportQuote });
http.route({ path: "/bolna/web-call-session", method: "POST", handler: webCallSession });
http.route({ path: "/bolna/web-call-session", method: "OPTIONS", handler: webCallPreflight });

// Call recordings (B6, §6.11): /rec/<callId>?t=<10-minute token from media.recToken>, Range/206.
http.route({ pathPrefix: REC_PATH_PREFIX, method: "GET", handler: serveRecording });

export default http;
