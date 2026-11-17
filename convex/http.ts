import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { bolnaReportQuote, bolnaWebhook, webCallPreflight, webCallSession } from "./bolnaHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

// Bolna (ARCHITECTURE §6.3, §7): each route checks its own secret or the caller's admin session.
http.route({ path: "/bolna/webhook", method: "POST", handler: bolnaWebhook });
http.route({ path: "/bolna/report-quote", method: "POST", handler: bolnaReportQuote });
http.route({ path: "/bolna/web-call-session", method: "POST", handler: webCallSession });
http.route({ path: "/bolna/web-call-session", method: "OPTIONS", handler: webCallPreflight });

export default http;
