import type {
  FunctionLikeMacroSymbolEntry,
  MacroSymbolEntry,
  SymbolEntry,
  SymbolKind,
} from "../types";
import { resolveLatex } from "./latex";
import { Lexer, Location, Token, TokenType } from "./lexer";
import assert from "node:assert";

interface AttributeInfo {
  startLoc: Location;
}

interface DeclarationInfo {
  startLoc: Location;
  endLoc: Location;
  attributes: AttributeInfo[];
}

interface TemplateParameter {
  raw: string;
}

interface TemplateInfo {
  // Full specialization, not partial
  specialization: boolean;
  templateParameters: TemplateParameter[];
}

enum DeclSpecContextType {
  Normal,
  Class,
  TypeSpecifier,
  Trailing,
  AliasDecl,
  ConvOp,
  TopLevel,
}

interface DeclarationGroup extends Array<DeclarationInfo> {}

const EMPTY_DECLARATION_GROUP: DeclarationGroup = [];

export class Parser {
  private readonly lexer: Lexer;
  private readonly header: string;
  private readonly nsStack: string[];

  symbols: SymbolEntry[];

  /** current token */
  private tok: Token;
  private nextTok(): Token {
    return this.lexer.peek();
  }

  constructor(lexer: Lexer, header: string) {
    this.lexer = lexer;
    this.header = header;
    this.nsStack = [];
    this.symbols = [];
    this.tok = lexer.next();
  }

  // ---- Token helpers ----

  private adv(): Token {
    const t = this.tok;
    this.tok = this.lexer.next();
    return t;
  }

  /** is identifier or keyword */
  private isId(v: string): boolean {
    return this.tok.type === TokenType.Identifier && this.tok.value === v;
  }

  /** is punctuation */
  private isP(v: string): boolean {
    return this.tok.type === TokenType.Punct && this.tok.value === v;
  }

  private eof(): boolean {
    return this.tok.type === TokenType.EOF;
  }

  private resolved(tok: Token): string {
    return tok.type === TokenType.LatexEscape ? resolveLatex(tok) : tok.value;
  }

  // ---- Balanced skip helpers ----

  private skipBalancedTokens(open: string, close: string): Token[] {
    const tokens: Token[] = [];
    assert(this.isP(open));
    let depth = 0;
    while (!this.eof()) {
      const v = this.tok.value;
      if (["(", "{", "["].includes(v)) {
        depth++;
      }
      if ([")", "}", "]"].includes(v)) {
        depth--;
      }
      tokens.push(this.tok);
      this.adv();
      if (depth === 0) {
        break;
      }
    }
    return tokens;
  }

  private skipBalancedTokensUntilPunct(
    untilPuncts: string[],
    considerUnparenedAngle = false,
  ): Token[] {
    const tokens: Token[] = [];
    let depth = 0;
    let parenDepth = 0;
    while (!this.eof()) {
      const v = this.tok.value;
      const open =
        parenDepth === 0 && considerUnparenedAngle
          ? ["(", "{", "[", "<"]
          : ["(", "{", "["];
      if (open.includes(v)) {
        depth++;
        if (v === "(") {
          parenDepth++;
        }
      }
      tokens.push(this.tok);
      this.adv();
      const close =
        parenDepth === 0 && considerUnparenedAngle
          ? [")", "}", "]", ">"]
          : [")", "}", "]"];
      if (close.includes(v)) {
        depth--;
        if (v === ")") {
          parenDepth--;
        }
      }
      if (
        depth === 0 &&
        this.tok.type === TokenType.Punct &&
        untilPuncts.includes(this.tok.value)
      ) {
        break;
      }
    }
    return tokens;
  }

  private skipBalancedNoCollect(open: string, close: string): void {
    let depth = 0;
    let started = false;
    while (!this.eof()) {
      const v = this.tok.value;
      if (v === open) {
        depth++;
        started = true;
      }
      if (v === close) depth--;
      this.adv();
      if (started && depth === 0) break;
    }
  }

  private skipToSemicolon(): void {
    let depth = 0;
    while (!this.eof()) {
      const v = this.tok.value;
      if (v === "(" || v === "[" || v === "<") depth++;
      else if (v === ")" || v === "]" || v === ">") depth--;
      else if (depth === 0 && v === ";") break;
      else if (depth === 0 && v === "{") {
        this.skipBalancedNoCollect("{", "}");
        continue;
      }
      this.adv();
    }
  }

  private skipToSemicolonOrBrace(): string {
    let depth = 0;
    let raw = "";
    while (!this.eof()) {
      const v = this.tok.value;
      if (depth === 0 && (v === ";" || v === "{")) break;
      if (v === "(" || v === "<") depth++;
      else if (v === ")" || v === ">") depth--;
      else if (v === "[") {
        /* skip */
      } else if (v === "]") {
        /* skip */
      }
      raw += (raw ? " " : "") + this.resolved(this.tok);
      this.adv();
    }
    return raw;
  }

  private skipInitializer(): void {
    let depth = 0;
    while (!this.eof()) {
      const v = this.tok.value;
      if (v === "(" || v === "{" || v === "<") depth++;
      else if (v === ")" || v === "}" || v === ">") depth--;
      else if (depth === 0 && (v === ";" || v === ",")) break;
      this.adv();
    }
  }

  private skipBaseClasses(): void {
    this.adv(); // consume :
    let depth = 0;
    while (!this.eof()) {
      const v = this.tok.value;
      if (v === "(") depth++;
      else if (v === ")") depth--;
      else if (v === "<") depth++;
      else if (v === ">") depth--;
      else if (depth === 0 && (v === "{" || v === ";")) break;
      this.adv();
    }
  }

  private parseTemplateParams(): TemplateParameter[] {
    assert(this.isP("<"));
    this.adv(); // consume <
    const parameters: TemplateParameter[] = [];
    // LOOSE PARSE: here might be a:
    // - type template parameter:
    //   `class|typename|<constraint> [...|<id> [= <typeid>]]`
    //   which: <constraints> cannot be disambiguate from NTTP without sema
    // - template template parameter:
    //   `template <parameters> [concept|class|typename|auto] [...|<id> [= <typeid>]]`
    // - NTTP: a parameter declaration
    // damn its too complex and we should skip!
    while (true) {
      const startLoc = this.tok.loc;
      this.skipBalancedTokensUntilPunct([",", ">"], true);
      const endLoc = this.tok.loc;
      parameters.push({ raw: this.lexer.range(startLoc, endLoc) });
      if (this.isP(">")) {
        this.adv();
        break;
      }
      assert(this.isP(","));
      this.adv();
    }
    return parameters;
  }

  private skipRequiresExpression(): string {
    let raw = "";

    if (this.isP("(")) {
      raw = this.skipBalanced("(", ")");
      return raw;
    }

    if (this.isP("{")) {
      this.skipBalancedNoCollect("{", "}");
      return "{ ... }";
    }

    // Otherwise, consume tokens that are part of the requires expression.
    // A requires-clause after template<...> ends when we see a declaration keyword
    // (class, struct, union, enum, using, concept, typedef) or an identifier that starts
    // the actual declaration. We track balanced parens and angle brackets.
    let depth = 0;
    const DECL_KEYWORDS = new Set([
      "class",
      "struct",
      "union",
      "enum",
      "using",
      "concept",
      "typedef",
      "inline",
      "constexpr",
      "consteval",
      "constinit",
      "static",
      "virtual",
      "explicit",
      "friend",
      "extern",
      "thread_local",
      "mutable",
      "volatile",
    ]);
    let tokenCount = 0;
    while (!this.eof()) {
      const v = this.tok.value;
      if (v === "(") depth++;
      else if (v === ")") depth--;
      else if (v === "<") depth++;
      else if (v === ">") depth--;

      // Stop at declaration-starting keywords at depth 0
      if (
        depth === 0 &&
        this.tok.type === TokenType.Identifier &&
        DECL_KEYWORDS.has(v)
      ) {
        break;
      }

      // Also stop at ; or { at depth 0 (end of requires clause context)
      if (depth === 0 && (v === ";" || v === "{")) {
        break;
      }

      raw += (raw ? " " : "") + this.resolved(this.tok);
      this.adv();
      tokenCount++;

      // Safety: don't consume more than 200 tokens
      if (tokenCount > 200) break;

      // After depth returns to 0 and we've consumed at least one token,
      // check if the next token could start a declaration
      if (depth <= 0 && tokenCount > 0) {
        // If we just closed balanced parens/brackets and the next token
        // looks like it starts a declaration, stop
        const nextIsDecl =
          this.tok.type === TokenType.Identifier &&
          DECL_KEYWORDS.has(this.tok.value);
        if (nextIsDecl) break;
      }
    }
    return raw.trim();
  }

  private isAttribute(): boolean {
    return (
      this.isId("alignas") || (this.isP("[") && this.nextTok().value === "[")
    );
  }

  private tryParseAttribute(): AttributeInfo[] {
    const attributes: AttributeInfo[] = [];
    while (this.isAttribute()) {
      if (this.isId("alignas")) {
        attributes.push({ startLoc: this.tok.loc });
        this.adv(); // alignas
        assert(this.isP("("));
        // LOOSE PARSE: parseExpression
        this.skipBalancedTokens("(", ")");
      } else {
        attributes.push({ startLoc: this.tok.loc });
        this.skipBalancedTokens("[", "]");
      }
    }
    return attributes;
  }

  private die(msg: string): never {
    const line = this.lexer.lines[this.tok.loc.line - 1] || "";
    throw new Error(
      `${this.tok.loc.line}:${this.tok.loc.col}: ${line}\n    ${msg} at token \`${this.tok.value}\` ...`,
    );
  }
  private unimplemented(name?: string): never {
    this.die(`Unimplemented parser feature ${name || ""}`);
  }

  // ---- Top-level ----

  parseTopLevel(): void {
    while (!this.eof()) {
      if (this.tok.type === TokenType.Identifier) {
        switch (this.tok.value) {
          case "module":
          case "import": {
            this.die(`module declarations not supported`);
          }
          case "export": {
            if (this.lexer.peek().value === "import") {
              this.die(`module declarations not supported`);
            }
          }
        }
      }
      const leadingAttributes = this.tryParseAttribute();
      this.parseExternalDeclaration({ leadingAttributes });
    }
  }

  // ---- Declaration ----

  private parseExternalDeclaration({
    leadingAttributes,
  }: {
    leadingAttributes: AttributeInfo[];
  }): DeclarationGroup {
    const startLoc = leadingAttributes[0]?.startLoc || this.tok.loc;
    if (this.eof()) {
      return EMPTY_DECLARATION_GROUP;
    }
    if (this.isP(";")) {
      this.adv();
      const endLoc = this.tok.loc;
      return [{ attributes: leadingAttributes, startLoc, endLoc }];
    }
    if (
      this.tok.type === TokenType.Identifier &&
      ["using", "namespace", "typedef", "template", "static_assert"].includes(
        this.tok.value,
      )
    ) {
      return this.parseDeclaration({ startLoc });
    }
    if (this.isId("inline")) {
      const nextTok = this.nextTok();
      if (
        nextTok.type === TokenType.Identifier &&
        nextTok.value === "namespace"
      ) {
        return this.parseDeclaration({ startLoc });
      }
    }
    if (this.isId("extern")) {
      const nextTok = this.nextTok();
      if (nextTok.type === TokenType.StringLiteral) {
        return this.parseLinkage(leadingAttributes);
      }
    }
    if (this.isId("export")) {
      return this.parseExportDeclaration(leadingAttributes);
    }
    return this.parseDeclarationOrFunctionDefinition(leadingAttributes);
  }

  /** parse a declaration which must NOT be a function definition */
  private parseDeclaration({
    startLoc,
  }: {
    startLoc: Location;
  }): DeclarationGroup {
    // template
    if (this.isId("template")) {
      const nextTok = this.nextTok();
      if (!(nextTok.type === TokenType.Punct && nextTok.value === "<")) {
        // explicit instantiation e.g.
        // template void f<int>();
        this.unimplemented("explicit instantiation");
      }
      return this.parseTemplateDeclarationOrSpecialization({ startLoc });
    }

    // [inline] namespace
    if (this.isId("namespace")) {
      return [this.parseNamespace({ inline: false })];
    }
    if (this.isId("inline")) {
      const nextTok = this.nextTok();
      if (
        nextTok.type === TokenType.Identifier &&
        nextTok.value === "namespace"
      ) {
        return [this.parseNamespace({ inline: true })];
      }
    }

    this.unimplemented("declarations other");

    // class/struct/union (but not inside template params)
    if (this.isId("class") || this.isId("struct") || this.isId("union")) {
      this.parseClassOrStruct(specs, tInfo);
      return;
    }

    // enum
    if (this.isId("enum")) {
      this.parseEnum(tInfo);
      return;
    }

    // typedef
    if (this.isId("typedef")) {
      this.parseTypedef();
      return;
    }

    // using
    if (this.isId("using")) {
      this.parseUsing(tInfo);
      return;
    }

    // concept
    if (this.isId("concept")) {
      this.parseConcept(tInfo);
      return;
    }

    // static_assert
    if (this.isId("static_assert")) {
      this.skipToSemicolon();
      if (this.isP(";")) this.adv();
      return;
    }

    // extern "C"/"C++" linkage specification
    if (specs.extern && this.tok.type === TokenType.StringLiteral) {
      const lang = this.tok.value.replace(/"/g, "");
      this.langLinkage = lang as "C" | "C++";
      this.adv();
      if (this.isP("{")) {
        this.adv();
        while (!this.eof() && !this.isP("}")) {
          if (this.isP("}")) break;
          const inner = this.parseSpecifiers();
          this.parseDeclaration(inner, null);
        }
        if (this.isP("}")) this.adv();
        this.langLinkage = null;
        return;
      }
    }

    // requires clause before declaration
    if (this.isId("requires")) {
      this.adv();
      this.skipRequiresExpression();
      const inner = this.parseSpecifiers();
      this.parseDeclaration(inner, tInfo);
      return;
    }

    // Disambiguate: function, variable, operator, deduction guide
    this.parseFunctionOrVariableOrOperator(specs, tInfo);
  }

  private parseLinkage(leadingAttributes: AttributeInfo[]): DeclarationGroup {
    this.unimplemented("linkage specification");
  }

  private parseExportDeclaration(
    leadingAttributes: AttributeInfo[],
  ): DeclarationGroup {
    this.unimplemented("export declaration");
  }

  private parseDeclarationOrFunctionDefinition(
    leadingAttributes: AttributeInfo[],
  ): DeclarationGroup {
    this.unimplemented("decl-or-func-def");
  }

  private parseDeclarationSpecifiers({}: { templateInfo: TemplateInfo }) {
    this.unimplemented("declaration-specifier");
  }

  // ---- Namespace ----

  private parseNamespace({ inline }: { inline: boolean }): DeclarationInfo {
    if (inline) {
      assert(this.isId("inline"));
      this.adv(); // "inline"
    }
    assert(this.isId("namespace"));
    this.adv(); // "namespace"

    const attributes = this.tryParseAttribute();

    let name = "";
    while (this.tok.type === TokenType.Identifier) {
      name = this.tok.value;
      this.adv();
      if (this.isP("::")) {
        name += "::";
        this.adv();
        // namespace X::inline Y { ... }
        if (this.isId("inline")) {
          this.adv();
        }
      } else {
        break;
      }
    }

    // namespace X = Y;
    if (this.isP("=")) {
      this.die("namespace alias");
    }

    // namespace { ... }
    if (!name) {
      this.die("anonymous namespaces not supported");
    }

    assert(this.isP("{"));
    this.adv(); // consume {

    this.nsStack.push(name);

    while (!this.isP("}")) {
      const leadingAttributes = this.tryParseAttribute();
      this.parseExternalDeclaration({ leadingAttributes });
    }
  }

  // ---- Using ----

  private parseUsingDirectiveOrDeclaration(): void {
    this.adv(); // "using"

    // using namespace X;
    if (this.isId("namespace")) {
      this.adv();
      const target = this.readQualifiedIdent();
      if (this.isP(";")) this.adv();
      this.push(
        this.makeSym(target, "usingDirective", null, undefined, undefined, {
          targetNamespace: target,
        }),
      );
      return;
    }

    // using typename X::Y;
    if (this.isId("typename")) {
      this.adv();
    }

    const first = this.readIdentOrLatex();
    if (!first) {
      this.skipToSemicolon();
      if (this.isP(";")) this.adv();
      return;
    }

    // using X = TYPE;
    if (this.isP("=")) {
      this.adv();
      const typeText = this.skipToSemicolonOrBrace();
      if (this.isP(";")) this.adv();
      const kind: SymbolKind = tInfo ? "typeAliasTemplate" : "typeAlias";
      this.push(
        this.makeSym(first, kind, tInfo, typeText || undefined, undefined, {
          syntax: "using" as const,
        }),
      );
      return;
    }

    // using X::Y::Z;
    let target = first;
    while (this.tok.type === TokenType.ScopeRes) {
      this.adv();
      const part = this.readIdentOrLatex();
      target += "::" + (part || "");
    }

    if (this.isP(";")) this.adv();
    const simpleName = target.includes("::")
      ? target.split("::").pop()!
      : target;
    this.push(
      this.makeSym(simpleName, "usingDeclaration", null, undefined, undefined, {
        target,
      }),
    );
  }

  // ---- Template ----

  private parseTemplateDeclarationOrSpecialization({
    startLoc,
  }: {
    startLoc: Location;
  }): DeclarationGroup {
    const templateParameters = [];
    assert(this.isId("template"));
    // there might be multiple template header...
    // we just keep the code structure but do not touch it now
    //   template<typename T>
    //     template<typename U>
    //       class A<T>::B { ... };
    let specialization = false;
    while (this.isId("template")) {
      this.adv(); // template
      const params = this.parseTemplateParams();
      if (params.length === 0) {
        specialization = true;
      }
      templateParameters.push(...params);
    }
    const templateInfo: TemplateInfo = {
      specialization,
      templateParameters,
    };
    if (this.isId("concept")) {
      this.unimplemented("concept");
    }
    return this.parseDeclarationAfterTemplate({
      startLoc,
      templateInfo,
    });
  }

  private parseDeclarationAfterTemplate({
    startLoc,
    templateInfo,
  }: {
    startLoc: Location;
    templateInfo: TemplateInfo;
  }): DeclarationGroup {
    // TODO if we are in member context, dispatch to a member declaration
    const attributes = this.tryParseAttribute();

    if (this.isId("using")) {
      // template <...> using T = ...;
      return this.parseUsingDirectiveOrDeclaration();
    }

    this.parseDeclarationSpecifiers({ templateInfo });
  }

  // ---- Class / struct / union ----

  private parseClassOrStruct(tInfo: TemplateInfo | null): void {
    const classKey = this.tok.value;
    if (classKey !== "class" && classKey !== "struct" && classKey !== "union")
      return;
    this.adv();

    const name = this.readIdentOrLatex();
    if (!name) {
      this.skipToSemicolonOrBrace();
      if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
      if (this.isP(";")) this.adv();
      return;
    }

    let hasTemplateArgs = false;
    if (this.isP("<")) {
      hasTemplateArgs = true;
      this.skipBalancedNoCollect("<", ">");
    }

    // final/abstract
    if (this.isId("final") || this.isId("abstract")) this.adv();

    // : base classes
    if (this.isP(":")) this.skipBaseClasses();

    let kind: SymbolKind;
    if (tInfo) {
      if (hasTemplateArgs) {
        kind = tInfo.isFullSpecialization
          ? "fullTemplateSpecialization"
          : "partialTemplateSpecialization";
      } else {
        kind = (classKey === "union" ? "class" : classKey) as
          | "class"
          | "struct";
        kind = (kind + "Template") as SymbolKind;
      }
    } else {
      if (hasTemplateArgs) {
        kind = "fullTemplateSpecialization";
      } else {
        kind = classKey as "class" | "struct" | "union";
      }
    }

    this.push(this.makeSym(name, kind, tInfo, undefined, undefined));

    if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
    if (this.isP(";")) this.adv();
  }

  // ---- Enum ----

  private parseEnum(tInfo: TemplateInfo | null): void {
    this.adv(); // "enum"

    let scoped = false;
    if (this.isId("class") || this.isId("struct")) {
      scoped = true;
      this.adv();
    }

    const name = this.readIdentOrLatex();
    if (!name) {
      this.skipToSemicolonOrBrace();
      if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
      if (this.isP(";")) this.adv();
      return;
    }

    if (this.isP(":")) {
      this.adv();
      this.skipToSemicolonOrBrace();
    }

    this.push(
      this.makeSym(name, "enum", tInfo, undefined, undefined, { scoped }),
    );

    if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
    if (this.isP(";")) this.adv();
  }

  // ---- Typedef ----

  private parseTypedef(): void {
    this.adv(); // "typedef"

    let lastIdent = "";
    while (!this.eof() && !this.isP(";")) {
      if (
        this.tok.type === TokenType.Identifier ||
        this.tok.type === TokenType.LatexEscape
      ) {
        lastIdent = this.resolved(this.tok);
      }
      this.adv();
    }
    if (this.isP(";")) this.adv();

    if (lastIdent) {
      this.push(
        this.makeSym(lastIdent, "typeAlias", null, undefined, undefined, {
          syntax: "typedef" as const,
        }),
      );
    }
  }

  // ---- Concept ----

  private parseConcept(tInfo: TemplateInfo | null): void {
    this.adv(); // "concept"
    const name = this.readIdentOrLatex();
    if (!name) {
      this.skipToSemicolon();
      if (this.isP(";")) this.adv();
      return;
    }

    this.skipToSemicolon();
    if (this.isP(";")) this.adv();
    this.push(this.makeSym(name, "concept", tInfo, undefined, undefined));
  }

  // ---- Operator detection ----

  private isOperatorAhead(): boolean {
    // Instead of scanning forward (which is fragile with lexer state),
    // we check if the current token sequence starts with something that
    // could contain "operator". We simply delegate to the scanner
    // which will detect "operator" during declarator analysis.
    // The real check happens in parseFunctionOrVariableOrOperator.
    return false;
  }

  // ---- Big disambiguator ----

  private parseFunctionOrVariableOrOperator(tInfo: TemplateInfo | null): void {
    // Check if current token stream starts with or contains "operator"
    // before we reach ( or ;
    if (this.detectOperator()) {
      this.parseOperator(specs, tInfo);
      return;
    }

    // Scan forward to classify the declaration
    const info = this.scanDeclarator(specs, tInfo);
    if (info) {
      this.emitDeclarator(info, specs, tInfo);
      return;
    }

    // Fallback: skip
    this.skipToSemicolonOrBrace();
    if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
    if (this.isP(";")) this.adv();
  }

  private detectOperator(): boolean {
    // Clone the lexer at the current position to look ahead without advancing
    const clone = this.lexer.clone();

    let depth = 0;
    let maxScan = 80;
    while (maxScan-- > 0) {
      const tok = clone.next();
      if (tok.type === TokenType.EOF) break;
      if (tok.type === TokenType.Identifier && tok.value === "operator")
        return true;
      if (tok.value === "(" || tok.value === "<") depth++;
      if (tok.value === ")" || tok.value === ">") depth--;
      if (
        depth === 0 &&
        (tok.value === ";" || tok.value === "{" || tok.value === "=")
      )
        break;
    }
    return false;
  }

  private scanDeclarator(tInfo: TemplateInfo | null): DeclaratorInfo | null {
    // Walk tokens collecting type/name, looking for '(' to indicate function,
    // '=' for variable, or '->' for deduction guide / trailing return type.
    const tokens: { resolved: string; raw: string }[] = [];
    let lastIdentIdx = -1;
    let hasNameAngleBracket = false;
    let sawOpenParen = false;
    let paramDepth = 0;
    let angleDepth = 0;
    let state: "type" | "params" | "afterParams" = "type";
    let paramText = "";
    let nameIdent = "";
    let returnType = "";
    let isDeductionGuide = false;
    let trailingRT = "";

    while (!this.eof()) {
      const v = this.tok.value;

      if (state === "type") {
        if (v === "(") {
          sawOpenParen = true;
          state = "params";
          paramDepth = 1;
          this.adv();
          continue;
        } else if (v === "=" || v === ";") {
          break;
        } else if (v === "{") {
          break;
        } else if (v === ",") {
          // Multiple declarators on one line - just take first
          break;
        } else if (
          this.tok.type === TokenType.Identifier ||
          this.tok.type === TokenType.LatexEscape
        ) {
          const r = this.resolved(this.tok);
          tokens.push({ resolved: r, raw: v });
          nameIdent = r;
          lastIdentIdx = tokens.length - 1;
          // Reset template args flag — only the last identifier before ( should have this set
          hasNameAngleBracket = false;
          this.adv();
          // Check for < after identifier (template args on name)
          // BUT: this might be part of a return type (e.g., vector<int> foo;)
          // We'll set hasNameAngleBracket here, but it gets reset if another
          // identifier follows before (
          if (this.isP("<")) {
            hasNameAngleBracket = true;
            this.skipBalancedNoCollect("<", ">");
          }
          continue;
        } else if (this.tok.type === TokenType.ScopeRes) {
          tokens.push({ resolved: "::", raw: "::" });
          this.adv();
          nameIdent = "";
          lastIdentIdx = -1;
          hasNameAngleBracket = false;
          continue;
        } else if ((this.tok.type as number) === TokenType.ScopeRes) {
          tokens.push({ resolved: "::", raw: "::" });
          this.adv();
          nameIdent = "";
          lastIdentIdx = -1;
          continue;
        } else if (v === "<") {
          // Part of type (e.g., allocator<T>)
          angleDepth++;
          tokens.push({ resolved: "<", raw: "<" });
          this.adv();
          this.skipBalancedNoCollect("<", ">");
          angleDepth--;
          tokens.push({ resolved: ">", raw: ">" });
          continue;
        } else {
          tokens.push({ resolved: v, raw: v });
          this.adv();
          continue;
        }
      }

      if (state === "params") {
        if (v === "(") {
          paramDepth++;
          paramText += "( ";
          this.adv();
          continue;
        } else if (v === ")") {
          paramDepth--;
          if (paramDepth > 0) {
            paramText += ") ";
          }
          this.adv();
          if (paramDepth === 0) {
            state = "afterParams";
          }
          continue;
        } else {
          paramText += this.resolved(this.tok) + " ";
          this.adv();
          continue;
        }
      }

      if (state === "afterParams") {
        if (this.tok.type === TokenType.Arrow) {
          isDeductionGuide = true;
          this.adv();
          while (!this.eof() && !this.isP(";") && !this.isP("{")) {
            trailingRT += this.resolved(this.tok) + " ";
            this.adv();
          }
          break;
        } else if (v === ";") {
          break;
        } else if (v === "{") {
          break;
        } else if (this.isId("noexcept")) {
          this.adv();
          if (this.isP("(")) this.skipBalancedNoCollect("(", ")");
          continue;
        } else if (this.isId("requires")) {
          this.adv();
          this.skipRequiresExpression();
          continue;
        } else if (
          this.isId("const") ||
          this.isId("override") ||
          this.isId("final")
        ) {
          this.adv();
          continue;
        } else if (v === "&" || v === "&&") {
          this.adv();
          continue;
        } else {
          this.adv();
          continue;
        }
      }

      this.adv();
    }

    // Analyze
    if (!sawOpenParen) {
      // Variable
      if (nameIdent) {
        returnType = tokens
          .slice(0, lastIdentIdx >= 0 ? lastIdentIdx : undefined)
          .filter((t) => t.resolved.trim().length > 0)
          .map((t) => t.resolved)
          .join(" ")
          .trim();
        return {
          name: nameIdent,
          kind: hasNameAngleBracket ? "variable" : "variable",
          returnType,
          parameters: [],
          hasTemplateArgsOnName: hasNameAngleBracket,
        };
      }
      return null;
    }

    // Function or deduction guide
    returnType = tokens
      .slice(0, lastIdentIdx >= 0 ? lastIdentIdx : undefined)
      .filter((t) => t.resolved.trim().length > 0)
      .map((t) => t.resolved)
      .join(" ")
      .trim();

    const params = this.splitParams(paramText);

    if (isDeductionGuide) {
      return {
        name: nameIdent,
        kind: "deductionGuide",
        returnType,
        parameters: params,
        hasTemplateArgsOnName: hasNameAngleBracket,
      };
    }

    return {
      name: nameIdent,
      kind: "function",
      returnType,
      parameters: params,
      hasTemplateArgsOnName: hasNameAngleBracket,
    };
  }

  private emitDeclarator(
    info: DeclaratorInfo,
    tInfo: TemplateInfo | null,
  ): void {
    if (info.kind === "deductionGuide") {
      this.push(
        this.makeSym(info.name, "deductionGuide", tInfo, undefined, undefined, {
          constructorName: info.name,
          parameters: info.parameters,
          targetType: info.returnType,
        }),
      );
      if (this.isP(";")) this.adv();
      return;
    }

    if (info.kind === "function") {
      if (info.hasTemplateArgsOnName) {
        this.push(
          this.makeSym(
            info.name,
            tInfo?.isFullSpecialization
              ? "fullTemplateSpecialization"
              : "partialTemplateSpecialization",
            tInfo,
            info.returnType || undefined,
            undefined,
          ),
        );
      } else {
        const kind: SymbolKind = tInfo ? "functionTemplate" : "function";
        this.push(
          this.makeSym(
            info.name,
            kind,
            tInfo,
            info.returnType || undefined,
            undefined,
            {
              returnType: info.returnType || "",
              parameters: info.parameters,
              constexpr: specs.constexpr || undefined,
            },
          ),
        );
      }
      // Skip function body if { ... }
      if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
      if (this.isP(";")) this.adv();
      return;
    }

    // Variable
    if (info.hasTemplateArgsOnName && tInfo) {
      this.push(
        this.makeSym(
          info.name,
          tInfo.isFullSpecialization
            ? "fullTemplateSpecialization"
            : "partialTemplateSpecialization",
          tInfo,
          info.returnType || undefined,
          undefined,
        ),
      );
    } else {
      const kind: SymbolKind = tInfo ? "variableTemplate" : "variable";
      this.push(
        this.makeSym(
          info.name,
          kind,
          tInfo,
          info.returnType || undefined,
          undefined,
          {
            type: info.returnType || "",
            constexpr: specs.constexpr || undefined,
            inline: specs.inline || undefined,
            extern: specs.extern || undefined,
          },
        ),
      );
    }
    // Skip initializer
    if (this.isP("=")) {
      this.adv();
      this.skipInitializer();
    }
    if (this.isP(";")) this.adv();
  }

  // ---- Operator ----

  private parseOperator(tInfo: TemplateInfo | null): void {
    // Collect return type tokens until "operator"
    let returnType = "";
    while (
      !this.eof() &&
      !(this.tok.type === TokenType.Identifier && this.tok.value === "operator")
    ) {
      returnType += (returnType ? " " : "") + this.resolved(this.tok);
      this.adv();
    }
    returnType = returnType.trim();

    if (!this.isId("operator")) {
      this.skipToSemicolonOrBrace();
      if (this.isP(";")) this.adv();
      return;
    }
    this.adv(); // consume "operator"

    let opName = "";
    let explicitConv = specs.explicit;

    // Determine which operator
    if (this.isP("(")) {
      // operator() - call operator
      this.adv();
      if (this.isP(")")) {
        opName = "()";
        this.adv();
      }
    } else if (this.isP("[")) {
      this.adv();
      if (this.isP("]")) {
        opName = "[]";
        this.adv();
      }
    } else if (this.tok.type === TokenType.Arrow) {
      opName = "->";
      this.adv();
      if (this.isP("*")) {
        opName = "->*";
        this.adv();
      }
    } else if (
      (this.tok.type as number) === TokenType.StringLiteral &&
      this.tok.value.startsWith('"')
    ) {
      // operator""suffix
      let sv = this.tok.value;
      // Extract suffix from string literal like ""sv or "sv"
      sv = sv.replace(/^"/, "").replace(/"$/, "");
      opName = 'operator""' + sv;
      this.adv();
    } else if (this.tok.type === TokenType.Identifier) {
      // Conversion operator: operator int, operator bool, operator basic_string, etc.
      opName = this.resolved(this.tok);
      this.adv();
      // Could be qualified: operator std::size_t
      while ((this.tok.type as number) === TokenType.ScopeRes) {
        opName += "::";
        this.adv();
        if (
          this.tok.type === TokenType.Identifier ||
          this.tok.type === TokenType.LatexEscape
        ) {
          opName += this.resolved(this.tok);
          this.adv();
        }
      }
      // Template type: operator vector<T>
      if (this.isP("<")) {
        // Skip template args
        this.skipBalancedNoCollect("<", ">");
      }
    } else if (
      this.tok.type === TokenType.Punct &&
      "+-*/%^&|~!=<>".includes(this.tok.value)
    ) {
      // Symbolic operator: + - * / % ^ & | ~ ! = < >
      // Could be compound: ++ -- += -= *= /= %= ^= &= |= <<= >>=
      opName = this.tok.value;
      this.adv();
      // Accumulate more punct chars that form compound operators
      const compoundOps = [
        "<<=",
        ">>=",
        "<=",
        ">=",
        "&&",
        "||",
        "==",
        "!=",
        "+=",
        "-=",
        "*=",
        "/=",
        "%=",
        "^=",
        "&=",
        "|=",
        "++",
        "--",
        "<<",
        ">>",
        "<=>",
      ];
      // Try to extend
      while (
        !this.eof() &&
        this.tok.type === TokenType.Punct &&
        "+-*/%^&|~!=<>".includes(this.tok.value)
      ) {
        const candidate = opName + this.tok.value;
        if (
          compoundOps.some((co) => co.startsWith(candidate) || candidate === co)
        ) {
          opName += this.tok.value;
          this.adv();
        } else {
          break;
        }
      }
    } else if (this.tok.type === TokenType.Ellipsis) {
      // Not a real C++ operator, but handle gracefully
      opName = "...";
      this.adv();
    } else if (this.isP("~")) {
      opName = "~";
      this.adv();
      // Usually followed by class name: ~ClassName()
      if ((this.tok.type as number) === TokenType.Identifier) {
        opName += this.resolved(this.tok);
        this.adv();
      }
    }

    // Parse parameter list
    const params = this.parseParameterList();

    // Skip trailing: noexcept, requires, const, &, &&, override, final
    this.skipFunctionTrailing();

    const kind: SymbolKind = tInfo ? "operatorTemplate" : "operator";
    this.push(
      this.makeSym(
        "operator" + opName,
        kind,
        tInfo,
        returnType || undefined,
        undefined,
        {
          operator: opName,
          explicit: explicitConv || undefined,
          parameters: params,
        },
      ),
    );

    if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
    if (this.isP(";")) this.adv();
  }

  // ---- Parameter list ----

  private parseParameterList(): string[] {
    if (!this.isP("(")) return [];
    const raw = this.skipBalanced("(", ")");
    let inner = raw.trim();
    if (inner.startsWith("(")) inner = inner.slice(1);
    if (inner.endsWith(")")) inner = inner.slice(0, -1);
    return this.splitParams(inner);
  }

  private splitParams(text: string): string[] {
    const t = text.trim();
    if (!t) return [];
    const params: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of t) {
      if (ch === "(" || ch === "<" || ch === "[") depth++;
      else if (ch === ")" || ch === ">" || ch === "]") depth--;
      if (ch === "," && depth === 0) {
        const p = current.trim();
        if (p) params.push(p);
        current = "";
      } else {
        current += ch;
      }
    }
    const p = current.trim();
    if (p) params.push(p);
    return params;
  }

  private skipFunctionTrailing(): void {
    while (!this.eof()) {
      if (this.isId("noexcept")) {
        this.adv();
        if (this.isP("(")) this.skipBalancedNoCollect("(", ")");
        continue;
      }
      if (
        this.isId("const") ||
        this.isId("override") ||
        this.isId("final") ||
        this.isId("volatile")
      ) {
        this.adv();
        continue;
      }
      if (this.isP("&")) {
        this.adv();
        continue;
      }
      if (this.isP("{")) {
        this.skipBalancedNoCollect("{", "}");
        return;
      }
      if (this.isP(";")) return;
      if (this.isId("requires")) {
        this.adv();
        this.skipRequiresExpression();
        continue;
      }
      // Check for && (rvalue ref qualifier)
      if (this.tok.value === "&&") {
        this.adv();
        continue;
      }
      break;
    }
  }

  // ---- Helpers ----

  private readIdentOrLatex(): string {
    if (this.tok.type === TokenType.Identifier) {
      const v = this.tok.value;
      this.adv();
      return v;
    }
    if (this.tok.type === TokenType.LatexEscape) {
      const v = resolveLatex(this.tok);
      this.adv();
      return v;
    }
    this.die("Expected identifier");
  }

  private readQualifiedIdent(): string {
    let name = "";
    while (!this.eof()) {
      if (
        this.tok.type === TokenType.Identifier ||
        this.tok.type === TokenType.LatexEscape
      ) {
        name += this.resolved(this.tok);
        this.adv();
      } else if (this.tok.type === TokenType.ScopeRes) {
        name += "::";
        this.adv();
      } else if (this.isP("<")) {
        this.skipBalancedNoCollect("<", ">");
      } else {
        break;
      }
    }
    return name;
  }

  private combineTI(
    outer: TemplateInfo | null,
    inner: TemplateInfo,
  ): TemplateInfo {
    if (!outer) return inner;
    return {
      templateParams: [...outer.templateParams, ...inner.templateParams],
      templateRequires: outer.templateRequires || inner.templateRequires,
      isFullSpecialization:
        outer.isFullSpecialization || inner.isFullSpecialization,
    };
  }

  private push(entry: SymbolEntry): void {
    this.symbols.push(entry);
  }

  private makeSym(
    name: string,
    kind: SymbolKind,
    tInfo: TemplateInfo | null,
    typeInfo?: string,
    raw?: string,
    extra?: Record<string, any>,
  ): SymbolEntry {
    const entry: Record<string, any> = {
      header: this.header,
      namespace: this.nsStack.join("::") || "std",
      name,
      kind,
    };
    if (this.inlineUnspec) entry.inlineUnspecifiedNamespace = true;
    if (this.langLinkage) entry.languageLinkage = this.langLinkage;
    if (tInfo && !tInfo.isFullSpecialization) {
      entry.templateParams = tInfo.templateParams;
      if (tInfo.templateRequires)
        entry.templateRequires = tInfo.templateRequires;
    }
    if (typeInfo) entry.type_info = typeInfo;
    entry.raw = (raw ?? name).substring(0, 500);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== false) entry[k] = v;
      }
    }
    return entry as SymbolEntry;
  }
}
