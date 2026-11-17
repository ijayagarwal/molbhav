import { AgentsPanel } from "@/features/admin/AgentsPanel";

// /app/admin/agents: founders only. Browser web calls with the four Bolna agents (no phone call); a call
// starts only from a founder's tap, and the session is minted on the server after an admin check.
export default function AdminAgentsPage() {
  return <AgentsPanel />;
}
