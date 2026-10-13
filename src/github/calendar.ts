// The public contribution calendar — exactly what github.com/<user> shows a
// logged-out visitor, including the "private contributions" lump when the user
// enabled it in their profile settings.
//
// Why read it at all when we have a token? A token's GraphQL view can be
// *smaller* than the public one: contributions in organizations that restrict
// OAuth apps or require SSO the token isn't authorized for vanish from the
// token's view entirely, while the public calendar still counts them. So the
// calendar is used as a floor: per year we keep whichever source saw more.
//
// It's an HTML page, not an API, so every parse failure degrades to `null`
// (meaning "no floor") instead of failing the run.

export interface CalendarWindow {
  total: number;
  activeDays: number;
}

const DAY_TOOLTIP = /<tool-tip[^>]*>\s*(No|[\d,]+) contributions? on /g;

export async function publicCalendar(login: string, from?: string, to?: string): Promise<CalendarWindow | null> {
  const qs = from && to ? `?from=${from}&to=${to}` : "";
  try {
    const res = await fetch(`https://github.com/users/${encodeURIComponent(login)}/contributions${qs}`, {
      headers: { "User-Agent": "fullpitch", Accept: "text/html" },
    });
    if (!res.ok) return null;
    return parseCalendar(await res.text());
  } catch {
    return null;
  }
}

export function parseCalendar(html: string): CalendarWindow | null {
  let total = 0;
  let activeDays = 0;
  let days = 0;
  for (const m of html.matchAll(DAY_TOOLTIP)) {
    days++;
    if (m[1] === "No") continue;
    const n = Number(m[1].replace(/,/g, ""));
    total += n;
    if (n > 0) activeDays++;
  }
  if (days === 0) return null; // markup changed — no floor rather than a wrong one
  return { total, activeDays };
}
