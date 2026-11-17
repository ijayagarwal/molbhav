// Scheduled retention (DECISIONS B6, S4; ARCHITECTURE §6.11). The jobs are in convex/retention.ts; each
// works in batches and continues itself. Daily jobs run at 03:10–03:20 IST, outside call hours.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("recordings and transcripts: delete at 30 days", { minuteUTC: 7 }, internal.retention.purgeRecordings, {});
crons.daily("callLog: delete rows older than a year", { hourUTC: 21, minuteUTC: 40 }, internal.retention.purgeCallLog, {});
crons.daily("anonymous users who never onboarded: delete after 7 days", { hourUTC: 21, minuteUTC: 50 }, internal.retention.purgeAnonUsers, {});

export default crons;
