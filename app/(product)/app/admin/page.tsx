import { AdminPanel } from "@/features/admin/AdminPanel";

// /app/admin: founders only (S1, R18, R26). The overview and the live-call settings; this page changes nothing
// (people and dealers are managed on their own tabs, live-call settings from the Convex CLI).
export default function AdminPage() {
  return <AdminPanel />;
}
