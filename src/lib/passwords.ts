/** What's wrong with a new password, in plain words — or null when it's fine. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 10) return "Use at least 10 characters for the password";
  if (password.length > 200) return "That password is too long";
  const p = password.toLowerCase();
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && p.includes(local)) return "The password can't contain your email name";
  if (COMMON.some((c) => p.includes(c)) && new Set(p).size < 8) return "That password is too easy to guess — try a short sentence";
  if (/^(.)\1+$/.test(p) || "0123456789abcdefghijklmnopqrstuvwxyz".includes(p) || "qwertyuiopasdfghjklzxcvbnm".includes(p)) return "That password is too easy to guess — try a short sentence";
  return null;
}

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "builder", "construction", "admin", "iloveyou", "monkey", "dragon", "football", "baseball"];
