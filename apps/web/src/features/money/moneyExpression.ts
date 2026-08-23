export type MoneyExpressionResult =
  | { ok: true; value: number; kind: "replacement" | "relative" | "expression" }
  | { ok: false; reason: "empty" | "invalid-expression" | "division-by-zero" | "non-finite" };

type FailureReason = Extract<MoneyExpressionResult, { ok: false }>['reason'];

class ParseFailure extends Error {
  constructor(readonly reason: FailureReason = "invalid-expression") {
    super(reason);
  }
}

class Parser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): number {
    const value = this.expression();
    if (this.index !== this.source.length) throw new ParseFailure();
    return value;
  }

  private expression(): number {
    let value = this.term();
    while (this.peek() === "+" || this.peek() === "-") {
      const operator = this.take();
      const right = this.term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private term(): number {
    let value = this.factor();
    while (this.peek() === "*" || this.peek() === "/") {
      const operator = this.take();
      const right = this.factor();
      if (operator === "/" && right === 0) throw new ParseFailure("division-by-zero");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  private factor(): number {
    const next = this.peek();
    if (next === "+" || next === "-") {
      this.take();
      const value = this.factor();
      return next === "-" ? -value : value;
    }
    if (next === "(") {
      this.take();
      const value = this.expression();
      if (this.take() !== ")") throw new ParseFailure();
      return value;
    }
    return this.number();
  }

  private number(): number {
    const start = this.index;
    let decimalPoints = 0;
    while (/\d|\./.test(this.peek() ?? "")) {
      if (this.take() === ".") decimalPoints += 1;
    }
    const token = this.source.slice(start, this.index);
    if (!token || token === "." || decimalPoints > 1) throw new ParseFailure();
    return Number(token);
  }

  private peek(): string | undefined {
    return this.source[this.index];
  }

  private take(): string | undefined {
    return this.source[this.index++];
  }
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function evaluateMoneyExpression(input: string, baseValue = 0): MoneyExpressionResult {
  const source = input.trim().replace(/[$,\s]/g, "");
  if (!source) return { ok: false, reason: "empty" };
  if (!/^[\d.+\-*/()]+$/.test(source)) return { ok: false, reason: "invalid-expression" };

  try {
    const relative = source[0] === "+" || source[0] === "-" || source[0] === "*" || source[0] === "/";
    const value = new Parser(relative ? `${baseValue}${source}` : source).parse();

    if (!Number.isFinite(value)) return { ok: false, reason: "non-finite" };
    const rounded = roundMoney(value);
    if (!Number.isFinite(rounded)) return { ok: false, reason: "non-finite" };
    return {
      ok: true,
      value: Object.is(rounded, -0) ? 0 : rounded,
      kind: relative ? "relative" : /[+\-*/()]/.test(source) ? "expression" : "replacement",
    };
  } catch (error) {
    return { ok: false, reason: error instanceof ParseFailure ? error.reason : "invalid-expression" };
  }
}
