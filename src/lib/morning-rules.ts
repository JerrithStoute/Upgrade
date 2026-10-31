/** The morning email's rules, kept apart from the database so they can be tested. */

export const MORNING_FROM = 6; // 6 am on the company's clock
export const MORNING_UNTIL = 12; // a server that was down all morning doesn't send at 9 pm

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Morning emails go out between 6 and noon (`now`: the company's wall date). */
export function morningWindow(now: Date) {
  return now.getHours() >= MORNING_FROM && now.getHours() < MORNING_UNTIL;
}

/** The weekly paperwork email goes on Mondays (`now`: the company's wall date). */
export const isPaperworkDay = (now: Date) => now.getDay() === 1;
