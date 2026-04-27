// ============================================================
// Token types
// ============================================================

import { resolveLaTeXInText } from "./latex";

export enum TokenType {
  Identifier,
  Number,
  StringLiteral,
  CharLiteral,
  Punct,
  LatexEscape, // @...@
  EOF,
}

export interface Location {
  readonly line: number;
  readonly col: number;
  readonly offset: number;
}

export interface IToken {
  readonly type: TokenType;
  readonly value: string;
  readonly loc: Location;
}

export class Token implements IToken {
  readonly type!: TokenType;
  readonly value!: string;
  readonly loc!: Location;
  constructor(token: IToken) {
    Object.assign(this, token);
  }
  /** is identifier or keyword */
  isId(v: string): boolean {
    return this.type === TokenType.Identifier && this.value === v;
  }

  /** is punctuation */
  isP(v: string): boolean {
    return this.type === TokenType.Punct && this.value === v;
  }

  isEof(): boolean {
    return this.type === TokenType.EOF;
  }
}

// ============================================================
// Lexer
// ============================================================

type StringToCharArray<Str extends string> =
  Str extends `${infer First}${infer Rest}`
    ? [First, ...StringToCharArray<Rest>]
    : [];

const MULTICHAR_PUNCTS = [
  "...",
  "<=>",
  "<<=",
  "->",
  "::",
  "[:",
  ":]",
  "^^",
  "&&",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "==",
  "!=",
  "<=",
  ">=",
  "||",
  "<<",
  "++",
  "--",
] as const;

const SINGLECHAR_PUNCTS = "{}()[]<>;:?.~!+-*/%^&|=," as const;

export type Punctuation =
  | (typeof MULTICHAR_PUNCTS)[number]
  | StringToCharArray<typeof SINGLECHAR_PUNCTS>[number];

const SINGLECHAR_PUNCTS_SET = new Set(SINGLECHAR_PUNCTS.split(""));

function hasOddTrailingBackslashes(value: string): boolean {
  let count = 0;
  for (let i = value.length - 2; i >= 0 && value[i] === "\\"; i--) {
    count++;
  }
  return count % 2 === 1;
}

export class Lexer {
  private readonly src: string;
  private pos: number;
  private line: number;
  private col: number;
  /** src.length */
  private readonly srcLen: number;
  public readonly lines: string[];

  #tok: Token;
  get tok(): Token {
    return this.#tok;
  }

  constructor(src: string) {
    this.src = src;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.srcLen = this.src.length;
    this.lines = src.split("\n");
    this.#tok = this.lex();
  }

  get loc(): Location {
    return { line: this.line, col: this.col, offset: this.pos };
  }

  clone(): Lexer {
    const cloned = new Lexer(this.src);
    cloned.pos = this.pos;
    cloned.line = this.line;
    cloned.col = this.col;
    cloned.#tok = this.#tok;
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

  private lex(): Token {
    this.skipWhitespaceAndComments();
    const loc = this.loc;

    if (this.pos >= this.srcLen) {
      return new Token({ type: TokenType.EOF, value: "", loc: this.loc });
    }
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
      return new Token({ type: TokenType.LatexEscape, value, loc });
    }

    // String literal
    if (c === '"') {
      let value = this.advance();
      while (this.pos < this.srcLen) {
        const x = this.advance();
        value += x;
        if (x === '"' && !hasOddTrailingBackslashes(value)) break;
      }
      return new Token({ type: TokenType.StringLiteral, value, loc });
    }

    // Char literal
    if (c === "'") {
      let value = this.advance();
      while (this.pos < this.srcLen) {
        const x = this.advance();
        value += x;
        if (x === "'" && !hasOddTrailingBackslashes(value)) break;
      }
      return new Token({ type: TokenType.CharLiteral, value, loc });
    }

    // Number
    if (c >= "0" && c <= "9") {
      let value = "";
      while (this.pos < this.srcLen && /[0-9a-fA-FxX.'_]/.test(this.ch))
        value += this.advance();
      return new Token({ type: TokenType.Number, value, loc });
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
        // LaTeX escape may occurs inside identifier, e.g.:
        // using int@\placeholdernc{N}@_t = @\seebelow@;
        if (this.ch === "@") {
          value += this.advance(); // consume @
          while (this.pos < this.srcLen && this.ch !== "@") {
            value += this.advance();
          }
          if (this.pos < this.srcLen) {
            value += this.advance();
          }
        }
      }
      return new Token({ type: TokenType.Identifier, value, loc });
    }

    // We omit >> intentionally since it's commonly used as adjacent
    // enclosing template param/args. The parsing of `operator>>` and
    // `operator>>=` is special-cased in the parser.
    for (const value of MULTICHAR_PUNCTS) {
      if (this.getN(value.length) === value) {
        for (let i = 0; i < value.length; i++) {
          this.advance();
        }
        return new Token({ type: TokenType.Punct, value, loc });
      }
    }

    // Single-char punctuation
    if (SINGLECHAR_PUNCTS_SET.has(c)) {
      this.advance();
      return new Token({ type: TokenType.Punct, value: c, loc });
    }

    throw new Error(`Unknown token: \`${this.getN(10)}\` ...`);
  }

  next() {
    this.#tok = this.lex();
    return this.#tok;
  }

  peek(): Token {
    const sp = this.pos;
    const sl = this.line;
    const sc2 = this.col;
    const nextTok = this.lex();
    this.pos = sp;
    this.line = sl;
    this.col = sc2;
    return nextTok;
  }

  range(startLoc: Location, endLoc: Location): string {
    return resolveLaTeXInText(
      this.src
        .slice(startLoc.offset, endLoc.offset)
        .replace(/\/\/.*$/gm, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
}
