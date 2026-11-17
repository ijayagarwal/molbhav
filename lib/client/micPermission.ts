// The mic permission, asked from the primer card's own button and never cold (DESIGN §12.1, §20, V5). A
// grant is remembered on this device (localStorage), so the primer shows once; the browser's own state
// (Permissions API, where it exists) wins when it says "denied". Small on purpose: it runs at press time.
import { micErrorCode, type MicProblem } from "./recorder";

export type MicPermission = "granted" | "denied" | "prompt" | "unknown";
export type MicSupport = "ok" | "insecure" | "unsupported";

const KEY = "molbhav:mic";

/** Whether this device can record at all: a secure page (https), getUserMedia and MediaRecorder. */
export function micSupport(): MicSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "insecure";
  if (typeof MediaRecorder === "undefined") return "unsupported";
  return "ok";
}

export function rememberedGrant(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "granted";
  } catch {
    return false;
  }
}

export function rememberGrant(granted: boolean) {
  try {
    if (granted) window.localStorage.setItem(KEY, "granted");
    else window.localStorage.removeItem(KEY);
  } catch {
    // private mode: the primer may show again next visit
  }
}

/** The browser's own answer, where the Permissions API knows "microphone" (Firefox may not). */
export async function queryMicPermission(): Promise<MicPermission> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state === "granted" || status.state === "denied" || status.state === "prompt" ? status.state : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Should a press start a take now, or show the primer first? Remembered or granted → start. Denied →
 * the primer with the "blocked" message. Unsupported or insecure → the primer with that message.
 */
export function micGate(support: MicSupport, permission: MicPermission, remembered: boolean): { start: true } | { start: false; error: MicProblem | null } {
  if (support !== "ok") return { start: false, error: support };
  if (permission === "denied") return { start: false, error: "mic_blocked" };
  if (permission === "granted" || remembered) return { start: true };
  return { start: false, error: null };
}

/** The primer's button: asks the browser, then releases the mic at once (nothing is recorded here). */
export async function requestMic(): Promise<{ ok: true } | { ok: false; code: MicProblem }> {
  const support = micSupport();
  if (support !== "ok") return { ok: false, code: support };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    rememberGrant(true);
    return { ok: true };
  } catch (e) {
    const code = micErrorCode(e);
    if (code === "mic_blocked") rememberGrant(false);
    return { ok: false, code };
  }
}
