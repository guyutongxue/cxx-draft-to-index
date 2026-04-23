import type {
  ExtractKind,
  SymbolEntry,
  SymbolEntryBase,
  SymbolKind,
} from "../types";
import { resolveLatex } from "./latex";
import { Lexer, Location, Token, TokenType } from "./lexer";
import assert from "node:assert";

interface AttributeInfo {
  raw: string;
}

interface TemplateParameter {
  raw: string;
}

interface TemplateInfo {
  // explicitInstantiation?: boolean;

  // Full specialization, not partial
  specialization: boolean;
  templateParameters: TemplateParameter[];

  requiresClause: string | null;
}

enum DeclSpecContextType {
  Unknown,
  Class,
  TopLevel,
  Trailing,
  // TypeSpec, // e.g. new struct S;
  // AliasDecl, // e.g. using X = struct S;
}

interface ExpressionInfo {
  raw: string;
}

interface DeclSpecifierSet {
  friend: boolean;
  typedef: boolean;
  constexpr: boolean;
  consteval: boolean;
  constinit: boolean;
  inline: boolean;
  // function
  virtual: boolean;
  explicit: boolean | ExpressionInfo;
  // storage-class
  static: boolean;
  thread_local: boolean;
  extern: boolean;
  mutable: boolean;
}

enum IdPartKind {
  Identifier,
  // must be the tail
  Operator,
  Conversion,
  UDL,
  Destructor,
  // must be the scope
  Computed, // decltype, pack-index, splice
}

interface IdExpressionPartInfo {
  kind: IdPartKind;
  name: string;
  templated: boolean;
}

interface IdExpressionInfo {
  name: string;
  parts: IdExpressionPartInfo[];
}

type ClassTagKind = "class" | "struct" | "union";
type ClassSpecifierUseKind = "definition" | "declaration" | "reference";

interface ClassSpecifierInfo {
  tagKind: ClassTagKind;
  name: string;
  useKind: ClassSpecifierUseKind;
  raw: string;
}

interface CvQualifierSet {
  const: boolean;
  volatile: boolean;
}

interface DeclarationSpecifierInfo {
  typeSpecifiers: string[];
  cvQualifiers: CvQualifierSet;
  declSpecifiers: DeclSpecifierSet;
  classSpecifier: ClassSpecifierInfo | null;
}

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
    return this.tok.isId(v);
  }

  /** is punctuation */
  private isP(v: string): boolean {
    return this.tok.isP(v);
  }

  private isIdentifierOrLaTeX(): boolean {
    return (
      this.tok.type === TokenType.Identifier ||
      this.tok.type === TokenType.LatexEscape
    );
  }

  private assertId(v: string): void {
    if (!this.isId(v)) {
      this.die(`Expected \`${v}\``);
    }
  }
  private assertP(v: string): void {
    if (!this.isP(v)) {
      this.die(`Expected \`${v}\``);
    }
  }

  private eof(): boolean {
    return this.tok.isEof();
  }

  private resolved(tok: Token): string {
    return tok.type === TokenType.LatexEscape ? resolveLatex(tok) : tok.value;
  }

  // ---- Balanced skip helpers ----

  private skipBalancedBrackets(open: "(", close: ")"): Token[];
  private skipBalancedBrackets(open: "{", close: "}"): Token[];
  private skipBalancedBrackets(open: "[", close: "]"): Token[];
  private skipBalancedBrackets(open: "[:", close: ":]"): Token[];
  private skipBalancedBrackets(open: string, close: string): Token[] {
    this.assertP(open);
    const openTok = this.adv(); // consume open
    const skipped = this.skipBalancedTokensUntilPunct([close], false);
    this.assertP(close);
    const closeTok = this.adv();
    return [openTok, ...skipped, closeTok];
  }
  private skipBalancedAngles(): Token[] {
    this.assertP("<");
    const openTok = this.adv(); // consume <
    const skipped = this.skipBalancedTokensUntilPunct([">"], true);
    const closeTok = this.adv(); // consume >
    return [openTok, ...skipped, closeTok];
  }

  private skipBalancedTokensUntilPunct(
    untilPuncts: string[],
    considerUnparenedAngle: boolean,
  ): Token[] {
    const tokens: Token[] = [];
    let depth = 0;
    let parenDepth = 0;
    while (!this.eof()) {
      const token = this.tok;
      const v = token.value;
      if (
        depth === 0 &&
        token.type === TokenType.Punct &&
        untilPuncts.includes(v)
      ) {
        break;
      }
      const open =
        parenDepth === 0 && considerUnparenedAngle
          ? ["(", "{", "[", "[:", "<"]
          : ["(", "{", "[", "[:"];
      tokens.push(token);
      this.adv();
      if (open.includes(v)) {
        depth++;
        if (v === "(") {
          parenDepth++;
        }
        continue;
      }
      const close =
        parenDepth === 0 && considerUnparenedAngle
          ? [")", "}", "]", ":]", ">"]
          : [")", "}", "]", ":]"];
      if (close.includes(v)) {
        depth--;
        if (v === ")") {
          parenDepth--;
        }
      }
    }
    return tokens;
  }

  private parseTemplateParams(): TemplateParameter[] {
    this.assertP("<");
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
      this.assertP(",");
      this.adv();
    }
    return parameters;
  }

  private isAttribute(): boolean {
    return this.isId("alignas") || (this.isP("[") && this.nextTok().isP("["));
  }

  private tryParseAttribute(): AttributeInfo[] {
    const attributes: AttributeInfo[] = [];
    while (this.isAttribute()) {
      if (this.isId("alignas")) {
        const startLoc = this.tok.loc;
        this.adv(); // alignas
        this.assertP("(");
        // LOOSE PARSE: parseExpression
        this.skipBalancedBrackets("(", ")");
        attributes.push({ raw: this.lexer.range(startLoc, this.tok.loc) });
      } else {
        const startLoc = this.tok.loc;
        this.skipBalancedBrackets("[", "]");
        attributes.push({ raw: this.lexer.range(startLoc, this.tok.loc) });
      }
    }
    return attributes;
  }

  private die(msg: string): never {
    const line = this.lexer.lines[this.tok.loc.line - 1] || "";
    throw new Error(
      `${this.header}:${this.tok.loc.line}:${this.tok.loc.col}: ${line}\n    ${msg} at token \`${this.tok.value}\` ...`,
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
      this.parseExternalDeclaration();
    }
  }

  // ---- Declaration ----

  private parseExternalDeclaration(): void {
    const startLoc = this.tok.loc;
    this.tryParseAttribute();
    if (this.isP(";")) {
      this.adv();
      return;
    }
    if (this.isId("extern")) {
      const nextTok = this.nextTok();
      if (nextTok.type === TokenType.StringLiteral) {
        return this.parseLinkage({ startLoc });
      }
    }
    if (this.isId("export")) {
      return this.parseExportDeclaration({ startLoc });
    }
    return this.parseDeclaration({ startLoc });
  }

  private parseDeclaration({ startLoc }: { startLoc: Location }): void {
    // template
    if (this.isId("template")) {
      const nextTok = this.nextTok();
      if (!nextTok.isP("<")) {
        // explicit instantiation e.g.
        // template void f<int>();
        this.unimplemented("explicit instantiation");
      }
      return this.parseTemplateDeclarationOrSpecialization({ startLoc });
    }

    // [inline] namespace
    if (this.isId("namespace")) {
      return this.parseNamespace({ inline: false });
    }
    if (this.isId("inline")) {
      const nextTok = this.nextTok();
      if (nextTok.isId("namespace")) {
        return this.parseNamespace({ inline: true });
      }
    }
    if (this.isId("using")) {
      return this.parseUsingDirectiveOrDeclaration({
        startLoc,
        templateInfo: null,
      });
    }
    if (this.isId("static_assert")) {
      this.unimplemented("static_assert");
    }
    return this.parseSimpleDeclarationOrFunctionDefinition({
      startLoc,
      templateInfo: null,
    });
  }

  private parseLinkage({}: { startLoc: Location }) {
    this.unimplemented("linkage specification");
  }

  private parseExportDeclaration({}: { startLoc: Location }) {
    this.unimplemented("export declaration");
  }

  /**
   * ```
   * simple-declaration:
   *     [decl-specifier-seq] [init-declarator-list] ;
   * function-definition:
   *     [decl-specifier-seq] declarator [some-stupid-grammar-here] function-body
   * ```
   */
  private parseSimpleDeclarationOrFunctionDefinition({
    startLoc,
    templateInfo,
  }: {
    startLoc: Location;
    templateInfo: TemplateInfo | null;
  }): void {
    const { classSpecifier } = this.parseDeclarationSpecifiers({
      declStartLoc: startLoc,
      templateInfo,
      declSpecContextType: DeclSpecContextType.TopLevel,
    });

    while (!this.isP(";")) {
      this.unimplemented("declarator");
    }
    this.adv(); // ;
    if (classSpecifier) {
      if (classSpecifier.tagKind === "union") {
        assert(!templateInfo, "union cannot be template");
        this.emitSymbol("union", {
          name: classSpecifier.name,
          raw: classSpecifier.raw + ";",
        });
      } else if (templateInfo) {
        this.emitSymbol("classTemplate", {
          name: classSpecifier.name,
          raw: this.lexer.range(startLoc, this.tok.loc),
          templateParams: templateInfo.templateParameters.map((p) => p.raw),
        });
      } else {
        this.emitSymbol("class", {
          name: classSpecifier.name,
          raw: classSpecifier.raw + ";",
        });
      }
    }
  }

  private parseDeclarationSpecifiers({
    declStartLoc,
    templateInfo,
    declSpecContextType,
  }: {
    declStartLoc: Location;
    templateInfo: TemplateInfo | null;
    declSpecContextType: DeclSpecContextType;
  }): DeclarationSpecifierInfo {
    // decl-specifier* attr-specifier*
    let classSpecifier: ClassSpecifierInfo | null = null;
    const attributes: AttributeInfo[] = [];
    const typeSpecifiers: string[] = [];
    const cvQualifiers = {
      const: false,
      volatile: false,
    };
    const declSpecifiers: DeclSpecifierSet = {
      friend: false,
      typedef: false,
      constexpr: false,
      consteval: false,
      constinit: false,
      inline: false,
      virtual: false,
      explicit: false,
      static: false,
      thread_local: false,
      extern: false,
      mutable: false,
    };
    let shouldReadIdExpression = false;

    while (true) {
      if (this.isP("[") && this.nextTok().isP("[")) {
        // attribute-specifier should marks end of decl-specifiers
        break;
      } else if (this.isP("::") || this.tok.type === TokenType.LatexEscape) {
        assert(typeSpecifiers.length == 0);
        shouldReadIdExpression = true;
        break;
      }
      if (this.tok.type !== TokenType.Identifier) {
        break;
      }
      const id = this.tok.value;
      if (id === "decltype") {
        // decltype(...)
        this.unimplemented("decltype in decl-specifier");
      } else if (
        [
          "friend",
          "typedef",
          "constexpr",
          "consteval",
          "constinit",
          "inline",
          "virtual",
          "explicit",
          "static",
          "thread_local",
          "extern",
          "mutable",
        ].includes(id)
      ) {
        declSpecifiers[id as keyof DeclSpecifierSet] = true;
        this.adv();
        if (id === "explicit" && this.isP("(")) {
          // explicit(bool)
          this.adv(); // (
          const startLoc = this.tok.loc;
          this.skipBalancedTokensUntilPunct([")"], false);
          this.adv(); // )
          const endLoc = this.tok.loc;
          declSpecifiers.explicit = { raw: this.lexer.range(startLoc, endLoc) };
        }
        continue;
      } else if (
        [
          "void",
          "int",
          "short",
          "long",
          "char",
          "char8_t",
          "char16_t",
          "char32_t",
          "signed",
          "unsigned",
          "float",
          "double",
          "bool",
        ].includes(id)
      ) {
        typeSpecifiers.push(id);
        this.adv();
        continue;
      } else if (id === "auto") {
        this.unimplemented("auto");
      } else if (["class", "struct", "union"].includes(id)) {
        classSpecifier = this.parseClassSpecifier({
          declStartLoc,
          templateInfo,
          declSpecContextType,
        });
      } else if (id === "enum") {
        // enum E e;     // elaborated-type-specifier
        // enum E { } e; // enum-specifier
        this.unimplemented("enum-head");
      } else if (id === "const" || id === "volatile") {
        cvQualifiers[id] = true;
        this.adv();
      } else if (id === "typename") {
        this.unimplemented("typename disambiguation");
      } else if (typeSpecifiers.length === 0) {
        shouldReadIdExpression = true;
      } else {
        break;
      }
    }
    if (shouldReadIdExpression) {
      // TODO check this later
      // BUGS constructor
      const { name } = this.readIdExpression();
      typeSpecifiers.push(name);
    }
    this.tryParseAttribute();
    return {
      typeSpecifiers,
      cvQualifiers,
      declSpecifiers,
      classSpecifier,
    };
  }

  // ---- Namespace ----

  private parseNamespace({ inline }: { inline: boolean }) {
    if (inline) {
      this.assertId("inline");
      this.adv(); // "inline"
    }
    this.assertId("namespace");
    this.adv(); // "namespace"

    this.tryParseAttribute();

    let name = "";
    while (this.isIdentifierOrLaTeX()) {
      name += this.resolved(this.tok);
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
      this.unimplemented("namespace alias");
    }

    // namespace { ... }
    if (!name) {
      this.unimplemented("anonymous namespaces");
    }

    this.assertP("{");
    this.adv(); // {

    this.nsStack.push(name);

    while (!this.isP("}")) {
      this.parseExternalDeclaration();
    }
    this.nsStack.pop();
    this.adv(); // }
  }

  // ---- Using ----

  private parseUsingDirectiveOrDeclaration({
    templateInfo,
    startLoc,
  }: {
    templateInfo: TemplateInfo | null;
    startLoc: Location;
  }): void {
    this.assertId("using");
    this.adv(); // "using"

    // using namespace X;
    if (this.isId("namespace")) {
      return this.parseUsingDirective();
    }

    return this.parseUsingDeclaration({ templateInfo, startLoc });
  }

  private parseUsingDirective(): void {
    this.assertId("namespace");
    this.unimplemented("using-directive");
  }

  private parseUsingDeclaration({
    templateInfo,
    startLoc,
  }: {
    templateInfo: TemplateInfo | null;
    startLoc: Location;
  }) {
    // using typename X::Y;
    if (this.isId("typename")) {
      this.adv();
    }

    if (this.isId("enum")) {
      this.unimplemented("using-enum-declaration");
    }

    let idExpr = this.readIdExpression();

    // using X = Y;
    if (this.isP("=")) {
      const { name, parts } = idExpr;
      assert(parts.length === 1);
      this.adv();
      this.skipBalancedTokensUntilPunct([",", ";"], true);
      if (this.isP(";")) this.adv();
      if (templateInfo) {
        this.emitSymbol("typeAliasTemplate", {
          name,
          raw: this.lexer.range(startLoc, this.tok.loc),
          syntax: "using",
          templateParams: templateInfo.templateParameters.map((p) => p.raw),
        });
      } else {
        this.emitSymbol("typeAlias", {
          name,
          raw: this.lexer.range(startLoc, this.tok.loc),
          syntax: "using",
        });
      }
      return;
    }

    // using X::Y, Z::W;
    while (true) {
      const { name, parts } = idExpr;
      this.emitSymbol("usingDeclaration", {
        name: parts.at(-1)!.name,
        raw: this.lexer.range(startLoc, this.tok.loc),
        target: name,
      });
      if (this.isP(";")) {
        this.adv();
        break;
      }
      this.assertP(",");
      this.adv();
      idExpr = this.readIdExpression();
    }
  }

  // ---- Template ----

  private parseTemplateDeclarationOrSpecialization({
    startLoc,
  }: {
    startLoc: Location;
  }): void {
    const templateParameters = [];
    let requiresClause: string | null = null;
    this.assertId("template");
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
      if (this.isId("requires")) {
        this.adv(); // requires
        const startLoc = this.tok.loc;
        this.parseConstraintExpression();
        const endLoc = this.tok.loc;
        requiresClause = this.lexer.range(startLoc, endLoc);
      }
    }
    const templateInfo: TemplateInfo = {
      specialization,
      templateParameters,
      requiresClause,
    };
    if (this.isId("concept")) {
      return this.parseConcept({ templateInfo, startLoc });
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
  }): void {
    // TODO if we are in member context, dispatch to a member declaration

    this.tryParseAttribute();

    if (this.isId("using")) {
      // template <...> using T = ...;
      return this.parseUsingDirectiveOrDeclaration({ startLoc, templateInfo });
    }

    return this.parseSimpleDeclarationOrFunctionDefinition({
      startLoc,
      templateInfo,
    });
  }

  // ---- Class / struct / union ----

  private parseClassSpecifier({
    declStartLoc,
    templateInfo,
    declSpecContextType,
  }: {
    declStartLoc: Location;
    templateInfo: TemplateInfo | null;
    declSpecContextType: DeclSpecContextType;
  }): ClassSpecifierInfo {
    const startLoc = this.tok.loc;
    const tagKind = this.tok.value as ClassTagKind;
    this.adv(); // class|struct|union

    let useKind: ClassSpecifierUseKind = "reference";
    this.tryParseAttribute();
    const { name, parts } = this.readIdExpression();

    // TODO: recover partial specialization from parts.at(-1)
    if (!templateInfo?.specialization) {
      assert(parts.length === 1);
    }
    // MISSED HERE:
    // friend class A, class B;
    // friend class Ts...;

    if (this.tok.isId("final")) {
      this.adv(); // final
    }

    if (this.tok.isP(":")) {
      this.adv();
      while (true) {
        this.tryParseAttribute();
        // access-specifier or virtual
        if (
          this.tok.type === TokenType.Identifier &&
          ["public", "protected", "private", "virtual"].includes(this.tok.value)
        ) {
          this.adv();
        }
        this.readIdExpression(); // class-or-decltype
        if (!this.isP(",")) {
          break;
        }
      }
      if (this.isP("...")) {
        this.adv(); // ...
      }
    }

    // TODO bugs here for friend declaration
    const mayDeclare = [
      DeclSpecContextType.TopLevel,
      DeclSpecContextType.Class,
    ].includes(declSpecContextType);

    if (mayDeclare && this.tok.isP("{")) {
      this.skipBalancedBrackets("{", "}");
      useKind = "definition";
    }
    if (mayDeclare && this.tok.isP(";")) {
      useKind = "declaration";
    }

    const endLoc = this.tok.loc;
    const raw = this.lexer.range(startLoc, endLoc);
    return { tagKind, name, useKind, raw };
  }

  // ---- Enum ----

  private parseEnum(): void {
    this.unimplemented("enum");
  }

  // ---- Concept ----

  private parseConcept({
    startLoc,
    templateInfo,
  }: {
    startLoc: Location;
    templateInfo: TemplateInfo;
  }): void {
    this.assertId("concept");
    this.adv(); // concept
    const name = this.readIdent();
    this.tryParseAttribute();

    this.assertP("=");
    this.adv(); // =
    this.parseConstraintExpression();
    this.emitSymbol("concept", {
      name,
      raw: this.lexer.range(startLoc, this.tok.loc),
      templateParams: templateInfo.templateParameters.map((p) => p.raw),
    });
    this.assertP(";");
    this.adv(); // ;
  }

  // ---- Expression ----

  private parseConstraintExpression(): void {
    // LOOSE PARSE: only consider:
    // - requires expression: requires (parameter-list) { requirement-seq }
    // - id-expression (single concept)
    // - balanced tokens start with '(' (assumes conjunction/disjunction are parenthesized)
    if (this.isId("requires")) {
      this.adv(); // requires
      if (this.isP("(")) {
        this.skipBalancedBrackets("(", ")");
      }
      this.assertP("{");
      this.skipBalancedBrackets("{", "}");
    } else if (this.isP("(")) {
      this.skipBalancedBrackets("(", ")");
    } else {
      this.readIdExpression();
    }
  }

  // ---- Helpers ----

  private readIdent(): string {
    if (this.isIdentifierOrLaTeX()) {
      const v = resolveLatex(this.tok);
      this.adv();
      return v;
    }
    this.die("Expected identifier");
  }

  /**
   * Reads an `id-expression`. Might be:
   * - unqualified-id (e.g. `foo`, `operator+`, `A<B>`)
   * - qualified-id (e.g. `A::B`, `A::operator+`, `A::template B<C>`)
   * - computed-id (e.g. `decltype(foo)::bar`, `[:M:]::baz`, `A...[I]`)
   * @returns
   */
  private readIdExpression(): IdExpressionInfo {
    const parts: IdExpressionPartInfo[] = [];
    let name = "";
    do {
      let hasTemplateDisambiguation = false;
      if (this.isP("::")) {
        this.adv();
        name += "::";
        if (this.isId("template")) {
          // A::template B<...>
          hasTemplateDisambiguation = true;
          this.adv();
        }
        continue;
      }
      const part = this.readIdExpressionPart(hasTemplateDisambiguation);
      parts.push(part);
      name += part.name;
      if (
        part.kind !== IdPartKind.Identifier &&
        part.kind !== IdPartKind.Computed
      ) {
        break;
      }
    } while (this.isP("::"));
    return { name, parts };
  }

  private readIdExpressionPart(
    hasTemplateDisambiguation: boolean,
  ): IdExpressionPartInfo {
    let name = hasTemplateDisambiguation ? "template " : "";
    let kind: IdPartKind;
    let templated = false;
    if (this.isId("decltype")) {
      this.adv();
      const startLoc = this.tok.loc;
      this.skipBalancedBrackets("(", ")");
      const endLoc = this.tok.loc;
      name += "decltype(" + this.lexer.range(startLoc, endLoc) + ")";
      kind = IdPartKind.Computed;
    } else if (this.isId("typename") || this.isId("template")) {
      name += this.tok.value + " ";
      this.adv();
      this.skipBalancedBrackets("[:", ":]");
      kind = IdPartKind.Computed;
    } else if (this.isP("~")) {
      name += "~";
      this.adv();
      this.unimplemented("destructor name parsing");
    } else if (this.isId("operator")) {
      name += "operator";
      this.adv();
      this.unimplemented(
        "operator-function, conversion-function or literal-operator name parsing",
      );
    } else if (this.isIdentifierOrLaTeX()) {
      name += this.resolved(this.tok);
      this.adv();
      kind = IdPartKind.Identifier;
    } else {
      this.die(`Unexpected token: ${this.tok.value}`);
    }
    // pack-index-expression
    if (this.isP("...") && this.nextTok().isP("[")) {
      const startLoc = this.tok.loc;
      this.adv(); // ...
      this.skipBalancedBrackets("[", "]");
      const endLoc = this.tok.loc;
      name += this.lexer.range(startLoc, endLoc);
      kind = IdPartKind.Computed;
    }
    // simple-template-id
    if (this.isP("<")) {
      const startLoc = this.tok.loc;
      this.skipBalancedAngles();
      const endLoc = this.tok.loc;
      name += this.lexer.range(startLoc, endLoc);
      templated = true;
    }
    return { kind, name, templated };
  }

  private push(entry: SymbolEntry): void {
    this.symbols.push(entry);
  }

  private emitSymbol<Kind extends SymbolKind>(
    kind: Kind,
    info: Omit<
      ExtractKind<SymbolEntry, Kind>,
      Exclude<keyof SymbolEntryBase, "raw" | "name"> | "kind"
    >,
  ): void {
    const symbol = {
      kind,
      ...info,
      header: this.header,
      namespace: this.nsStack.join("::"),
      // indicates a CPO
      // TODO inlineUnspecifiedNamespace
      // TODO languageLinkage
    } as SymbolEntry;
    console.log(symbol);
    this.push(symbol);
  }
}
