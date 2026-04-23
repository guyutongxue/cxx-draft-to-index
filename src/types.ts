export interface SymbolEntryBase {
  header: string;
  namespace: string;
  // indicates a CPO
  inlineUnspecifiedNamespace?: boolean;
  raw: string;
  name: string;
  languageLinkage?: "C" | "C++";
}

export interface MacroSymbolEntry extends SymbolEntryBase {
  kind: "macro";
}

export interface FunctionLikeMacroSymbolEntry extends SymbolEntryBase {
  kind: "functionLikeMacro";
  parameters: string[]; // raw parameter strings for now
}

export interface ClassSymbolEntry extends SymbolEntryBase {
  kind: "class" | "struct" | "union";
}

export interface EnumSymbolEntry extends SymbolEntryBase {
  kind: "enum";
  // enum class
  scoped: boolean;
}

export interface TypeAliasSymbolEntry extends SymbolEntryBase {
  kind: "typeAlias";
  syntax: "typedef" | "using";
}

export interface VariableSymbolEntry extends SymbolEntryBase {
  kind: "variable";
  type: "string";
  constexpr?: boolean;
  inline?: boolean;
  extern?: boolean;
}

export interface FunctionSymbolEntry extends SymbolEntryBase {
  kind: "function";
  constexpr?: boolean;
  returnType: string;
  parameters: string[]; // raw parameter strings for now
  // void foo() requires <constraints>;
  // signatureRequires?: string | null;
}

export interface OperatorSymbolEntry extends SymbolEntryBase {
  kind: "operator";
  operator: string; // e.g. "+", "[]", "int", etc.
  explicit?: boolean; // for conversion operators
  parameters: string[]; // raw parameter strings for now
}

// using std::foo;
export interface UsingDeclarationSymbolEntry extends SymbolEntryBase {
  kind: "usingDeclaration";
  target: string; // e.g. "std::foo"
}

// using namespace literals::chrono_literals
export interface UsingDirectiveSymbolEntry extends SymbolEntryBase {
  kind: "usingDirective";
  targetNamespace: string; // e.g. "literals::chrono_literals"
}

// namespace views = ranges::views;
export interface NamespaceAliasSymbolEntry extends SymbolEntryBase {
  kind: "namespaceAlias";
  targetNamespace: string; // e.g. "ranges::views"
}

export interface PartialTemplateSpecializationSymbolEntry extends SymbolEntryBase, TemplateInfo {
  kind: "partialTemplateSpecialization";
  templateArgs: string[]; // raw template argument strings for now
}
export interface FullTemplateSpecializationSymbolEntry extends SymbolEntryBase {
  kind: "fullTemplateSpecialization";
  templateArgs: string[]; // raw template argument strings for now
}

export interface DeductionGuideSymbolEntry
  extends SymbolEntryBase, TemplateInfo {
  kind: "deductionGuide";
  constructorName: string;
  parameters: string[];
  targetType: string;
}

type TemplateInfo = {
  templateParams: string[]; // raw strings for now
  // template <params...> requires <constraints> <decl>
  templateRequires?: string | null;
};

type Computed<T> = { [K in keyof T]: T[K] };

type Templatize<T extends SymbolEntryBase> = Computed<
  T extends {
    kind: infer Kind extends string;
  }
    ? Omit<T, "kind"> & {
        kind: `${Kind}Template`;
      } & TemplateInfo
    : never
>;

interface TypeAliasTemplateSymbolEntry extends Templatize<
  TypeAliasSymbolEntry & { syntax: "using" }
> {}

export interface FunctionTemplateSymbolEntry extends Templatize<FunctionSymbolEntry> {}
export interface ClassTemplateSymbolEntry extends Templatize<
  ClassSymbolEntry & { kind: "class" | "struct" }
> {}
export interface VariableTemplateSymbolEntry extends Templatize<VariableSymbolEntry> {}
export interface OperatorTemplateSymbolEntry extends Templatize<OperatorSymbolEntry> {}

export interface ConceptSymbolEntry extends TemplateInfo, SymbolEntryBase {
  kind: "concept";
}

export type SymbolEntry =
  | MacroSymbolEntry
  | FunctionLikeMacroSymbolEntry
  | ClassSymbolEntry
  | EnumSymbolEntry
  | TypeAliasSymbolEntry
  | VariableSymbolEntry
  | FunctionSymbolEntry
  | OperatorSymbolEntry
  | UsingDeclarationSymbolEntry
  | UsingDirectiveSymbolEntry
  | NamespaceAliasSymbolEntry
  | PartialTemplateSpecializationSymbolEntry
  | FullTemplateSpecializationSymbolEntry
  | TypeAliasTemplateSymbolEntry
  | FunctionTemplateSymbolEntry
  | ClassTemplateSymbolEntry
  | VariableTemplateSymbolEntry
  | OperatorTemplateSymbolEntry
  | ConceptSymbolEntry
  | DeductionGuideSymbolEntry;

export type SymbolKind = SymbolEntry["kind"];

export type ExtractKind<
  T extends SymbolEntry,
  Kind extends SymbolKind,
> = T extends {
  kind: infer U;
}
  ? U extends Kind
    ? T
    : never
  : never;

type X = ExtractKind<SymbolEntry, "classTemplate">;

export interface HeaderIndex {
  header: string;
  symbols: SymbolEntry[];
}

export interface IndexOutput {
  version: string;
  generated_at: string;
  headers: HeaderIndex[];
}
