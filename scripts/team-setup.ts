// The Team test's phone numbers, the easy way (docs/TEAM_TEST.md, START_HERE C5). Asks for the founder's and the
// teammate's mobile numbers in two clearly labelled macOS dialogs, then: re-verifies the founder's contractor
// account with the founder's number, sets the teammate dealer's number (admin.replaceDealerPhone), and sets
// TEST_PHONE_HASHES so trial-mode live calls may reach that phone. Numbers are never printed (only the last two
// digits, to confirm) and never written to disk. Dev only. Never dials.
//   pnpm team:setup            the founder's number, then the teammate's
//   pnpm team:setup --solo     only the founder's number: the founder plays the dealer on their own phone
//                              (verified in Bolna), e.g. when no teammate is around
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Team = { contractorId: string; contractorName: string; dealers: { dealerId: string; name: string; card: string }[] };

function ask(title: string, text: string): string | null {
  const script = `text returned of (display dialog ${JSON.stringify(text)} default answer "" with title ${JSON.stringify(title)} buttons {"Cancel", "Save"} default button "Save")`;
  try {
    return execFileSync("osascript", ["-e", script], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null; // Cancel
  }
}

function tenDigits(raw: string | null): string | null {
  const d = (raw ?? "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

function run(fn: string, args: object): Record<string, unknown> {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const json = out.slice(out.indexOf("{"));
  return json.startsWith("{") ? (JSON.parse(json) as Record<string, unknown>) : {};
}

const masked = (d: string) => `••••••••${d.slice(-2)}`;
const today = new Date().toISOString().slice(0, 10);

function main(argv: string[]): number {
  const solo = argv.includes("--solo");
  const team = (JSON.parse(readFileSync("bolna/team-test.json", "utf8")) as Record<string, Team | string>).dev as Team;
  const dealer = team.dealers[0];
  const founder = tenDigits(
    ask("Molbhav · 1 of 2 · YOUR number", `YOUR OWN mobile number (the founder; the app account "${team.contractorName}").\n\n10 digits. It marks that account as verified for live calls.`),
  );
  if (founder === null) {
    console.log("Stopped: no valid 10-digit number for you (nothing changed).");
    return 1;
  }
  const mate = solo
    ? founder
    : tenDigits(
    ask(
      "Molbhav · 2 of 2 · TEAMMATE's number",
      `Your TEAMMATE's mobile number (verified in Bolna). They play Card ${dealer.card} · ${dealer.name} and receive the AI test calls.\n\n10 digits. By saving, you confirm they agreed to AI test calls and to the calls being recorded.`,
    ),
  );
  if (mate === null) {
    console.log("Stopped: no valid 10-digit number for the teammate (nothing changed).");
    return 1;
  }
  if (founder === mate && !solo) {
    console.log("Stopped: the two numbers are the same. The founder and the teammate need different phones (nothing changed).");
    return 1;
  }
  const actor = "team-setup";
  run("admin:unverifyContractor", { contractorId: team.contractorId, note: `team:setup ${today}: re-verify with the founder's number`, actor });
  run("admin:verifyContractor", { contractorId: team.contractorId, phone: founder, note: `team:setup ${today}: founder's own test account`, actor });
  const r = run("admin:replaceDealerPhone", {
    dealerId: dealer.dealerId,
    phone: mate,
    consentNote: solo
      ? `team:setup --solo ${today}: the founder plays Card ${dealer.card} on their own Bolna-verified phone and agrees to AI test calls and recording`
      : `team:setup ${today}: teammate (Card ${dealer.card}) agreed to AI test calls and recording; verified in Bolna`,
    actor,
  });
  const hash = String(r.phoneHash ?? "");
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    console.log("The teammate's number could not be set (see the Convex error above). The founder's account was updated.");
    return 1;
  }
  execFileSync("npx", ["convex", "env", "set", "TEST_PHONE_HASHES", hash], { stdio: ["ignore", "ignore", "inherit"] });
  console.log(
    solo
      ? `Done (solo). You (account "${team.contractorName}", verified) and the test dealer ${dealer.name}: ${masked(founder)}. You play the dealer on your own phone.`
      : `Done. You (account "${team.contractorName}", verified): ${masked(founder)} · teammate (${dealer.name}): ${masked(mate)}.`,
  );
  console.log(`Live calls in trial mode can now reach only ${solo ? "your" : "the teammate's"} phone.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
