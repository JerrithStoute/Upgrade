/**
 * Quantity formulas that use your estimate parameters, Excel-style:
 *   =[Heated sq. ft.] * 1.1        =roundup([Wall area] / 32)
 *
 * You see and type parameter names in brackets; they're stored by id ("[#ckx…]")
 * so renaming a parameter never breaks a formula. Numbers, + − * / ^, brackets and
 * the functions below — nothing else is ever run.
 */

export type FormulaParam = { id: string; name: string };

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  roundup: ([x, d = 0]) => Math.ceil(x * 10 ** d - 1e-9) / 10 ** d,
  rounddown: ([x, d = 0]) => Math.floor(x * 10 ** d + 1e-9) / 10 ** d,
  round: ([x, d = 0]) => Math.round(x * 10 ** d) / 10 ** d,
  ceiling: ([x, step = 1]) => (step ? Math.ceil(x / step - 1e-9) * step : x),
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  abs: ([x]) => Math.abs(x),
};
export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);

type Token = { t: "num"; v: number } | { t: "ref"; v: string } | { t: "op"; v: string } | { t: "fn"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) throw new Error(`"${c}" isn't a number`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (c === "[") {
      const end = src.indexOf("]", i);
      if (end < 0) throw new Error("A [ has no closing ]");
      out.push({ t: "ref", v: src.slice(i + 1, end) });
      i = end + 1;
    } else if ("+-*/^(),×÷x".includes(c) && !(c === "x" && /[a-z]/i.test(src[i + 1] ?? ""))) {
      out.push({ t: "op", v: c === "×" || c === "x" ? "*" : c === "÷" ? "/" : c });
      i++;
    } else if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(src.slice(i))!;
      const name = m[0].toLowerCase();
      if (!FUNCTIONS[name]) throw new Error(`"${m[0]}" isn't something a formula can use`);
      out.push({ t: "fn", v: name });
      i += m[0].length;
    } else throw new Error(`"${c}" can't be used in a formula`);
  }
  return out;
}

/** Recursive descent: expr = term (± term)*, term = power (×÷ power)*, power = unary (^ unary)?, unary = −unary | atom. */
function evaluateTokens(tokens: Token[], ref: (r: string) => number): number {
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(v === ")" ? "A ( has no closing )" : `Expected "${v}"`);
    i++;
  };
  const atom = (): number => {
    const tk = tokens[i++];
    if (!tk) throw new Error("The formula ends too soon");
    if (tk.t === "num") return tk.v;
    if (tk.t === "ref") return ref(tk.v);
    if (tk.t === "fn") {
      expect("(");
      const args = [expr()];
      while (isOp(",")) {
        i++;
        args.push(expr());
      }
      expect(")");
      return FUNCTIONS[tk.v](args);
    }
    if (tk.v === "(") {
      const v = expr();
      expect(")");
      return v;
    }
    throw new Error(`"${tk.v}" is in the wrong place`);
  };
  const unary = (): number => {
    if (isOp("-")) {
      i++;
      return -unary();
    }
    if (isOp("+")) {
      i++;
      return unary();
    }
    return atom();
  };
  const power = (): number => {
    const b = unary();
    if (isOp("^")) {
      i++;
      return b ** unary();
    }
    return b;
  };
  const term = (): number => {
    let v = power();
    while (isOp("*") || isOp("/")) {
      const op = tokens[i++].v;
      const r = power();
      v = op === "*" ? v * r : r === 0 ? 0 : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[i++].v;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  if (i < tokens.length) throw new Error(`"${(tokens[i] as { v: unknown }).v}" is in the wrong place`);
  if (!Number.isFinite(v)) throw new Error("The result isn't a number");
  return v;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * What you typed ("=[Heated sq. ft.] * 1.1", the "=" optional) → the stored form
 * ("[#id] * 1.1"), checked. Unknown names and broken formulas give an error.
 */
export function toStoredFormula(typed: string, params: FormulaParam[]): { formula: string } | { error: string } {
  const body = typed.trim().replace(/^=/, "").trim();
  if (!body) return { error: "Type a formula after the =" };
  const byName = new Map(params.map((p) => [norm(p.name), p.id]));
  let unknown: string | null = null;
  const stored = body.replace(/\[([^\]]*)\]/g, (_, name: string) => {
    const id = byName.get(norm(name));
    if (!id) unknown ??= name;
    return `[#${id ?? "?"}]`;
  });
  if (unknown !== null) return { error: `There's no parameter called "${unknown}"` };
  try {
    evaluateTokens(tokenize(stored), () => 1);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { formula: stored };
}

/** The stored form back as you'd type it ("=[Heated sq. ft.] * 1.1"). A deleted parameter shows as [?]. */
export function toDisplayFormula(stored: string, params: FormulaParam[]) {
  const byId = new Map(params.map((p) => [p.id, p.name]));
  return "=" + stored.replace(/\[#([^\]]*)\]/g, (_, id: string) => `[${byId.get(id) ?? "?"}]`);
}

/** The ids a stored formula uses. */
export function formulaRefs(stored: string) {
  return Array.from(stored.matchAll(/\[#([^\]]*)\]/g), (m) => m[1]);
}

/**
 * A stored formula's value for this job. Parameters with no value count as 0 and are
 * listed in `missing` (names), so the screen can say what still needs filling in.
 */
export function evaluateFormula(stored: string, values: Record<string, number>, params: FormulaParam[]): { value: number; missing: string[]; error?: string } {
  const byId = new Map(params.map((p) => [p.id, p.name]));
  const missing: string[] = [];
  try {
    const value = evaluateTokens(tokenize(stored), (r) => {
      const id = r.replace(/^#/, "");
      const v = values[id];
      if (v === undefined || !byId.has(id)) {
        const n = byId.get(id) ?? "a deleted parameter";
        if (!missing.includes(n)) missing.push(n);
        return 0;
      }
      return v;
    });
    return { value: Math.round(value * 10000) / 10000, missing };
  } catch (e) {
    return { value: 0, missing, error: (e as Error).message };
  }
}
