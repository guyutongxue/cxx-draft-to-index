
// ============================================================
// Token types
// ============================================================

export enum TokenType {
  Identifier,
  Number,
  StringLiteral,
  CharLiteral,
  Punct,
  Ellipsis,
  ScopeRes, // ::
  Arrow, // ->
  LatexEscape, // @...@
  EOF,
}

export interface Location {
  line: number;
  col: number;
  offset: number;
}

export interface Token {
  type: TokenType;
  value: string;
  loc: Location;
}

// ============================================================
// Lexer
// ============================================================

const PUNCT_CHARS = new Set("{}()[],;:=*%+!~^&.|/<>?#@".split(""));

export class Lexer {
  private readonly src: string;
  private pos: number;
  private line: number;
  private col: number;
  /** src.length */
  private readonly srcLen: number;
  public readonly lines: string[];

  constructor(src: string) {
    this.src = src;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.srcLen = this.src.length;
    this.lines = src.split("\n");
  }

  get loc(): Location {
    return { line: this.line, col: this.col, offset: this.pos };
  }

  clone(): Lexer {
    const cloned = new Lexer(this.src);
    cloned.pos = this.pos;
    cloned.line = this.line;
    cloned.col = this.col;
    return cloned;
  }

  /**
   * character at `this.pos + offset`
   * @param [offset=0]
   */
  private get ch(): string {
    return this.pos < this.srcLen ? this.src[this.pos] : "\0";
  }

  private getN(size: number): string {
    return this.src.slice(this.pos, Math.min(this.pos + size, this.srcLen));
  }

  private advance(): string {
    const c = this.src[this.pos];
    if (c === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    this.pos++;
    return c;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.srcLen) {
      const c = this.ch;
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        this.advance();
      } else if (this.getN(2) === "//") {
        while (this.pos < this.srcLen && this.ch !== "\n") this.advance();
      } else if (this.getN(2) === "/*") {
        this.advance();
        this.advance();
        while (this.pos < this.srcLen) {
          if (this.getN(2) === "*/") {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  next(): Token {
    this.skipWhitespaceAndComments();

    if (this.pos >= this.srcLen) {
      return { type: TokenType.EOF, value: "", loc: this.loc };
    }

    /** start line */
    const sl = this.line;
    /** start col */
    const sc = this.col;
    const c = this.ch;

    // @...@ LaTeX escape
    if (c === "@") {
      this.advance();
      let value = "@";
      while (this.pos < this.srcLen && this.ch !== "@") {
        value += this.advance();
      }
      if (this.pos < this.srcLen) {
        value += this.advance();
      }
      return { type: TokenType.LatexEscape, value, loc: this.loc };
    }

    // String literal
    if (c === '"') {
      let value = this.advance();
      while (this.pos < this.srcLen) {
        const x = this.advance();
        value += x;
        if (x === '"' && value[value.length - 2] !== "\\") break;
      }
      return { type: TokenType.StringLiteral, value, loc: this.loc };
    }

    // Char literal
    if (c === "'") {
      let value = this.advance();
      while (this.pos < this.srcLen) {
        const x = this.advance();
        value += x;
        if (x === "'" && value[value.length - 2] !== "\\") break;
      }
      return { type: TokenType.CharLiteral, value, loc: this.loc };
    }

    // Number
    if (c >= "0" && c <= "9") {
      let value = "";
      while (this.pos < this.srcLen && /[0-9a-fA-FxX.'_]/.test(this.ch))
        value += this.advance();
      return { type: TokenType.Number, value, loc: this.loc };
    }

    // Identifier / keyword
    const isIdentifierPart = (ch: string) => {
      return (
        ch === "_" ||
        (ch >= "a" && ch <= "z") ||
        (ch >= "A" && ch <= "Z") ||
        (ch >= "0" && ch <= "9")
      );
    };
    if (c === "_" || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
      let value = "";
      while (this.pos < this.srcLen && isIdentifierPart(this.ch)) {
        value += this.advance();
      }
      return { type: TokenType.Identifier, value, loc: this.loc };
    }

    // ...
    if (this.getN(3) === "...") {
      this.advance();
      this.advance();
      this.advance();
      return { type: TokenType.Ellipsis, value: "...", loc: this.loc };
    }

    // ->
    if (this.getN(2) === "->") {
      this.advance();
      this.advance();
      return { type: TokenType.Arrow, value: "->", loc: this.loc };
    }

    // ::
    if (this.getN(2) === "::") {
      this.advance();
      this.advance();
      return { type: TokenType.ScopeRes, value: "::", loc: this.loc };
    }

    // TODO do we have any multiple char punctuators not handled yet?

    // Single-char punctuation
    if (PUNCT_CHARS.has(c)) {
      this.advance();
      return { type: TokenType.Punct, value: c, loc: this.loc };
    }

    throw new Error(`Unknown token: \`${this.getN(10)}\` ...`);
  }

  peek(): Token {
    const sp = this.pos;
    const sl = this.line;
    const sc2 = this.col;
    const tok = this.next();
    this.pos = sp;
    this.line = sl;
    this.col = sc2;
    return tok;
  }
}
