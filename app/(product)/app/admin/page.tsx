import { AdminPanel } from "@/features/admin/AdminPanel";

// /app/admin: founders only (S1, R18). Read-only; writes run from the Convex CLI.
export default function AdminPage() {
  return <AdminPanel />;
}
