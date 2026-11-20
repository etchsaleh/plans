import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps iOS type sizes and colours side by side", () => {
    expect(cn("text-headline text-white")).toBe("text-headline text-white");
  });
  it("still dedupes conflicting colours and sizes", () => {
    expect(cn("text-white text-ios-blue")).toBe("text-ios-blue");
    expect(cn("text-body text-footnote")).toBe("text-footnote");
  });
});
