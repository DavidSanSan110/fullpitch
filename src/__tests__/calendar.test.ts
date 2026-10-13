import { describe, expect, it } from "vitest";
import { parseCalendar } from "../github/calendar";

const day = (label: string) => `<tool-tip id="t" for="d" popover="manual" class="sr-only">${label}</tool-tip>`;

describe("parseCalendar", () => {
  it("sums daily tooltips and counts active days", () => {
    const html = [day("5 contributions on October 12th."), day("No contributions on October 13th."), day("1 contribution on October 14th."), day("1,204 contributions on May 1st.")].join("");
    expect(parseCalendar(html)).toEqual({ total: 1210, activeDays: 3 });
  });

  it("returns null when the markup is unrecognised", () => {
    expect(parseCalendar("<html>nothing here</html>")).toBeNull();
  });
});
