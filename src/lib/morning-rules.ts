/** The morning email's rules, kept apart from the database so they can be tested. */

export const MORNING_FROM = 6; // 6 am on the company's clock
export const MORNING_UNTIL = 12; // a server that was down all morning doesn't send at 9 pm

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Morning emails go out between 6 and noon (`now`: the company's wall date). */
export function morningWindow(now: Date) {
  return now.getHours() >= MORNING_FROM && now.getHours() < MORNING_UNTIL;
}

/**
 * Which "about to expire" email a certificate is due today: 30 (a month out), 7 (a week out)
 * or 0 (it lapsed) — or null when it's already had that one, or isn't close.
 *
 * `daysLeft` is whole days until it expires (negative: lapsed that long ago); `reminded` is
 * the last one sent. A certificate that lapsed more than 3 days ago with no reminder on
 * record is left alone: it's old news (and it keeps the first morning after this was switched
 * on from emailing every sub about last year's certificates).
 */
export function insuranceStage(daysLeft: number, reminded: number | null): 30 | 7 | 0 | null {
  const stage = daysLeft < 0 ? 0 : daysLeft <= 7 ? 7 : daysLeft <= 30 ? 30 : null;
  if (stage === null) return null;
  if (reminded !== null && reminded <= stage) return null;
  if (stage === 0 && reminded === null && daysLeft < -3) return null;
  return stage;
}
