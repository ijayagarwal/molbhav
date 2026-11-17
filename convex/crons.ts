// Scheduled jobs (ARCHITECTURE §6.11 retention). Each entry is independent: add new ones as their own
// `crons.<kind>(...)` call with its own comment, and keep the names unique.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sandbox (/try, G3, ARCHITECTURE §6.9): orders past their 24 h `expiresAt` are deleted with their calls,
// call events, quotes and share rows (sandbox.deleteExpired; app orders are never touched).
crons.interval("sandbox: delete expired orders", { minutes: 30 }, internal.sandbox.deleteExpired, {});

export default crons;
