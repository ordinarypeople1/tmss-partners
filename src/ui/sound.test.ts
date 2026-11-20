import { describe, expect, it } from "vitest";
import type { Message } from "../sim/types";
import { CUES, MESSAGE_SOUNDS, cueLength, isMuted, playSound, setMuted, soundFor, type SoundName } from "./sound";

/**
 * What each message type should sound like when it is addressed to the player
 * and asks for no decision. A `Record` over the union: adding a message type
 * fails to compile here until someone decides its cue.
 */
const EXPECTED: Record<Message["type"], SoundName | null> = {
  welcome: null,
  rate_changed: null,
  phase_changed: null,
  owner_opened: "good",
  owner_declined: "bad",
  sale_early_notice: null,
  sale_started: null,
  sale_withdrawn: null,
  sale_failed: null,
  rival_deal: null,
  teaser_received: null,
  shortlisted: "good",
  not_shortlisted: "bad",
  bank_pitch: "good",
  rival_approach: "bad",
  lost_to_rival: "bad",
  rival_rebuffed: "good",
  house_fundraised: null,
  house_partner_left: null,
  house_distress: null,
  owner_succeeded: null,
  ceo_moved: "good",
  auction_lost: "bad",
  final_round: null,
  regulator_blocked: "bad",
  event: null,
  achievement_unlocked: "good",
  objectives_review: null,
  diligence_report: null,
  committee_decision: null,
  deal_closed: "fanfare",
  deal_broken: "bad",
  initiative_done: "good",
  issue_surfaced: "bad",
  strike: "bad",
  covenant_breach: "bad",
  lenders_took_keys: "bad",
  refinanced: null,
  recap_paid: "good",
  add_on_closed: null,
  exit_offer: null,
  exit_pulled: null,
  exit_closed: "fanfare",
  proceeds_received: "good",
  quarter_report: null,
  investment_period_ended: null,
  fund_term_ended: null,
  next_fund: "fanfare",
  promotion: "fanfare",
  fired: "bad",
};

const TYPES = Object.keys(EXPECTED) as Message["type"][];

/** Only the fields `soundFor` reads matter; the body's own fields are left out. */
function message(type: Message["type"], extra: Partial<Pick<Message, "news" | "decision">> = {}): Message {
  return {
    type,
    id: 1,
    date: { year: 2025, month: 1 },
    news: false,
    company: null,
    read: false,
    decision: null,
    ...extra,
  } as unknown as Message;
}

describe("soundFor", () => {
  it("covers every message type", () => {
    expect(Object.keys(MESSAGE_SOUNDS).sort()).toEqual([...TYPES].sort());
    expect(TYPES.length).toBeGreaterThanOrEqual(36);
  });

  it.each(TYPES)("gives %s its cue", (type) => {
    expect(soundFor(message(type))).toBe(EXPECTED[type]);
  });

  it.each(TYPES)("chimes when %s waits for a decision", (type) => {
    const open = { options: ["first", "second"], due_month: 3, chosen: null } as unknown as Message["decision"];
    expect(soundFor(message(type, { decision: open }))).toBe("decision");
  });

  it("falls back to the type's cue once the decision is taken", () => {
    const taken = { options: ["first", "second"], due_month: 3, chosen: "first" } as unknown as Message["decision"];
    expect(soundFor(message("event", { decision: taken }))).toBeNull();
    expect(soundFor(message("exit_closed", { decision: taken }))).toBe("fanfare");
  });

  it.each(TYPES)("stays silent for %s as market news", (type) => {
    expect(soundFor(message(type, { news: true }))).toBeNull();
  });
});

describe("cues", () => {
  const names = Object.keys(CUES) as SoundName[];

  it("defines all seven", () => {
    expect(names.sort()).toEqual(["act", "bad", "decision", "fanfare", "good", "month", "refuse"]);
  });

  it.each(names)("%s is short, soft and well formed", (name) => {
    const cue = CUES[name];
    const length = cueLength(name);
    expect(length).toBeGreaterThanOrEqual(0.06);
    expect(length).toBeLessThanOrEqual(0.6);
    expect(cue.gap).toBeGreaterThanOrEqual(80);
    expect(cue.tones.length).toBeGreaterThan(0);
    for (const part of cue.tones) {
      expect(part.frequency).toBeGreaterThanOrEqual(120);
      expect(part.frequency).toBeLessThanOrEqual(3000);
      expect(part.level).toBeGreaterThan(0);
      expect(part.level).toBeLessThanOrEqual(0.7);
      expect(part.attack).toBeLessThan(part.length);
      // Harsh waveforms have no place in a paper-and-ink game.
      expect(["sine", "triangle"]).toContain(part.wave);
    }
  });

  it("rises for good news, falls for bad news, climbs for the fanfare", () => {
    const pitches = (name: SoundName) => CUES[name].tones.filter((part) => part.level > 0.2).map((part) => part.frequency);
    expect(pitches("good")[1]).toBeGreaterThan(pitches("good")[0]);
    expect(pitches("bad")[1]).toBeLessThan(pitches("bad")[0]);
    expect(pitches("refuse")[1]).toBeLessThan(pitches("refuse")[0]);
    const fanfare = pitches("fanfare");
    expect(fanfare).toHaveLength(3);
    expect(fanfare[1]).toBeGreaterThan(fanfare[0]);
    expect(fanfare[2]).toBeGreaterThan(fanfare[1]);
  });

  it("rate-limits the tick harder than the 80 ms floor", () => {
    expect(CUES.act.gap).toBeGreaterThan(80);
  });
});

describe("without a browser", () => {
  it("defaults to sound on and remembers a change for the session", () => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it("never throws when the audio API is missing", () => {
    for (const name of Object.keys(CUES) as SoundName[]) {
      expect(() => playSound(name)).not.toThrow();
    }
    expect(() => playSound("nonsense" as SoundName)).not.toThrow();
  });
});
