import { describe, it, expect } from "vitest";
import { renderHeadline } from "./diagnosis-sentence";

describe("renderHeadline", () => {
  it("returns text directly for fallback variant", () => {
    expect(renderHeadline({ kind: "fallback", text: "Diagnostic complete." })).toBe("Diagnostic complete.");
  });

  it("joins lead + accent for structured with accent", () => {
    expect(
      renderHeadline({
        kind: "structured",
        score: "5 of 8",
        lead: "3 of 3 wrong answers share the same pattern:",
        accentPhrase: "Negative distribution",
      }),
    ).toBe("3 of 3 wrong answers share the same pattern: Negative distribution");
  });

  it("returns lead alone when accentPhrase is null", () => {
    expect(
      renderHeadline({
        kind: "structured",
        score: "1 of 1",
        lead: "No mistakes worth flagging.",
        accentPhrase: null,
      }),
    ).toBe("No mistakes worth flagging.");
  });
});
