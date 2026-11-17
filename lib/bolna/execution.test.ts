import { describe, expect, test } from "vitest";
import { MAX_TRANSCRIPT_CHARS, parseExecution, parseExecutionList, recipientCallId } from "./execution";

// The completed example from https://www.bolna.ai/docs/post-call/execution-payload (trimmed), with our call id.
const COMPLETED = {
  id: "b7140255-af33-4608-8e97-04dd944b8e48",
  agent_id: "5bc97541-e320-4d95-a3a5-242cfe45621d",
  status: "completed",
  termination_reason: "user_hung_up",
  conversation_duration: 61.4,
  created_at: "2026-09-04T08:52:07.408883+00:00",
  initiated_at: "2026-09-04T08:52:09.737874",
  user_number: "+919812345601",
  transcript: "assistant: नमस्ते जी, ये मोलभाव से AI कॉल है\nuser: हाँ जी\n",
  telephony_data: {
    duration: 63,
    to_number: "+919812345601",
    recording_url: "https://api.bolna.ai/recordings/call/b7140255-af33-4608-8e97-04dd944b8e48",
    hangup_reason: "inactivity_timeout",
  },
  total_cost: 12.5,
  context_details: { recipient_phone_number: "+919812345601", recipient_data: { molbhav_call_id: "k17abcdefghijklmnop", timezone: "Asia/Kolkata" } },
};

describe("parseExecution", () => {
  test("keeps what we store, in our units", () => {
    expect(parseExecution(COMPLETED)).toEqual({
      id: COMPLETED.id,
      agentId: COMPLETED.agent_id,
      status: "completed",
      terminationReason: "user_hung_up",
      transcript: COMPLETED.transcript,
      durationSec: 61,
      costUsdCents: 12.5,
      recordingUrl: COMPLETED.telephony_data.recording_url,
      molbhavCallId: "k17abcdefghijklmnop",
      toNumber: "+919812345601",
      createdAt: Date.parse("2026-09-04T08:52:07.408Z"),
    });
  });

  test("an in-progress event without the finished fields", () => {
    expect(parseExecution({ id: COMPLETED.id, status: "ringing" })).toEqual({ id: COMPLETED.id, status: "ringing" });
  });

  test("hostile or broken payloads are dropped, not guessed", () => {
    expect(parseExecution(null)).toBeNull();
    expect(parseExecution([])).toBeNull();
    expect(parseExecution({ status: "completed" })).toBeNull();
    expect(parseExecution({ id: "../../etc", status: "completed" })).toBeNull();
    expect(parseExecution({ id: COMPLETED.id, status: "<script>" })).toBeNull();
    const weird = parseExecution({
      id: COMPLETED.id,
      status: "completed",
      total_cost: -5,
      conversation_duration: "NaN",
      termination_reason: "a b c",
      telephony_data: { recording_url: "http://insecure.example/x", to_number: "call me" },
      context_details: { recipient_data: { molbhav_call_id: "DROP TABLE" } },
    });
    expect(weird).toEqual({ id: COMPLETED.id, status: "completed" });
  });

  test("an over-long transcript is capped", () => {
    const snap = parseExecution({ id: COMPLETED.id, status: "completed", transcript: "x".repeat(MAX_TRANSCRIPT_CHARS + 50) });
    expect(snap?.transcript?.length).toBe(MAX_TRANSCRIPT_CHARS);
  });

  test("recipientCallId reads only a call-id-shaped molbhav_call_id", () => {
    expect(recipientCallId(COMPLETED)).toBe("k17abcdefghijklmnop");
    expect(recipientCallId({ context_details: { recipient_data: { molbhav_call_id: "webcall-demo" } } })).toBeUndefined();
    expect(recipientCallId({})).toBeUndefined();
  });

  test("parseExecutionList reads `data` and `has_more`", () => {
    expect(parseExecutionList({ data: [COMPLETED, { nope: 1 }], has_more: true })).toEqual({ items: [parseExecution(COMPLETED)], hasMore: true });
    expect(parseExecutionList([COMPLETED])).toEqual({ items: [], hasMore: false });
  });
});
