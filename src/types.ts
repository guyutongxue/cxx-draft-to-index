export interface NamespaceInfo {
  name: string | null; // null for anonymous namespace
  inline: boolean;
}

export interface SymbolEntryBase {
  header: string;
  namespace: NamespaceInfo[];
  raw: string;
  name: string;
  languageLinkage: string | null;
}

export interface Parameter {
  name: string | null;
  type: string;
  defaultArg: string | null;
  raw: string;
  pack: boolean;
}

export interface TemplateParameter extends Parameter {
  kind: "type" | "constant" | "ttConstant" | "ttConcept" | "ttType";
  templateParams: TemplateParameter[] | null; // for template template parameters
}

export interface MacroSymbolEntry extends SymbolEntryBase {
  kind: "macro";
}

export interface FunctionLikeMacroSymbolEntry extends SymbolEntryBase {
  kind: "functionLikeMacro";
  parameters: string[]; // raw parameter strings for now
}

export interface ClassSymbolEntry extends SymbolEntryBase {
  kind: "class";
  classKey: "class" | "struct";
  base: string[];
  members: ClassMemberEntry[] | null;
}

export interface UnionSymbolEntry extends SymbolEntryBase {
  kind: "union";
  members: ClassMemberEntry[] | null;
}

export interface EnumeratorEntry {
  name: string;
  raw: string;
  value: string | null;
}

export interface EnumSymbolEntry extends SymbolEntryBase {
  kind: "enum";
  // enum class
  scoped: boolean;
  enumerators: EnumeratorEntry[] | null;
}

export interface TypeAliasSymbolEntry extends SymbolEntryBase {
  kind: "typeAlias";
  syntax: "typedef" | "using";
}

export interface VariableSymbolEntry extends SymbolEntryBase {
  kind: "variable";
  type: string;
  constexpr: boolean;
  inline: boolean;
  extern: boolean;
}

export interface FunctionSymbolEntry extends SymbolEntryBase {
  kind: "function";
  constexpr: boolean;
  operator: string | null; // e.g. +, [], ""ms (udl), int (conversion)
  explicit: boolean | string; // ctor and conversion
  friend: boolean;
  returnType: string | null;
  isTrailingReturnType: boolean;
  parameters: Parameter[];
  variadic: boolean;
  // void foo() requires <constraints>;
  signatureRequires: string | null;
}

export interface FriendTypeSymbolEntry extends SymbolEntryBase {
  kind: "friendType";
}

// using std::foo;
export interface UsingDeclarationSymbolEntry extends SymbolEntryBase {
  kind: "usingDeclaration";
  target: string; // e.g. "std::foo"
}

// using enum foo::Bar;
export interface UsingEnumSymbolEntry extends SymbolEntryBase {
  kind: "usingEnum";
  target: string; // e.g. "foo::Bar"
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

export interface DeductionGuideSymbolEntry extends SymbolEntryBase {
  kind: "deductionGuide";
  parameters: Parameter[];
  targetType: string;
}

export interface Template {
  templateParams: TemplateParameter[];
  // template <params...> requires <constraints> <decl>
  templateRequires?: string | null;
}

interface SpecializationInfo {
  templateArgs: string[]; // raw template argument strings
}

type Computed<T> = { [K in keyof T]: T[K] };

type Templatize<T extends SymbolEntryBase> = Computed<
  T extends {
    kind: infer Kind extends string;
  }
    ? Omit<T, "kind"> & {
        kind: `${Kind}Template`;
      } & Template
    : never
>;

type FullSpecialize<T extends SymbolEntryBase> = Computed<
  T extends {
    kind: infer Kind extends string;
  }
    ? Omit<T, "kind"> & {
        kind: `${Kind}FullSpecialization`;
      } & SpecializationInfo
    : never
>;
type PartialSpecialize<T extends SymbolEntryBase> = Computed<
  T extends {
    kind: infer Kind extends string;
  }
    ? Omit<T, "kind"> & {
        kind: `${Kind}PartialSpecialization`;
      } & Template &
        SpecializationInfo
    : never
>;

export interface TypeAliasTemplateSymbolEntry extends Templatize<
  TypeAliasSymbolEntry & { syntax: "using" }
> {}
export interface FunctionTemplateSymbolEntry extends Templatize<FunctionSymbolEntry> {}
export interface ClassTemplateSymbolEntry extends Templatize<ClassSymbolEntry> {}
export interface VariableTemplateSymbolEntry extends Templatize<VariableSymbolEntry> {}
export interface DeductionGuideTemplateSymbolEntry extends Templatize<DeductionGuideSymbolEntry> {}

export interface ConceptSymbolEntry extends Template, SymbolEntryBase {
  kind: "concept";
}

export interface FunctionFullSpecializationSymbolEntry extends FullSpecialize<FunctionSymbolEntry> {}
export interface ClassFullSpecializationSymbolEntry extends FullSpecialize<ClassSymbolEntry> {}
export interface VariableFullSpecializationSymbolEntry extends FullSpecialize<VariableSymbolEntry> {}

export interface ClassPartialSpecializationSymbolEntry extends PartialSpecialize<ClassSymbolEntry> {}
export interface VariablePartialSpecializationSymbolEntry extends PartialSpecialize<VariableSymbolEntry> {}

export type SymbolEntry =
  | MacroSymbolEntry
  | FunctionLikeMacroSymbolEntry
  | ClassSymbolEntry
  | UnionSymbolEntry
  | EnumSymbolEntry
  | TypeAliasSymbolEntry
  | VariableSymbolEntry
  | FunctionSymbolEntry
  | FriendTypeSymbolEntry
  | UsingDeclarationSymbolEntry
  | UsingEnumSymbolEntry
  | UsingDirectiveSymbolEntry
  | NamespaceAliasSymbolEntry
  | DeductionGuideSymbolEntry
  | TypeAliasTemplateSymbolEntry
  | FunctionTemplateSymbolEntry
  | ClassTemplateSymbolEntry
  | VariableTemplateSymbolEntry
  | ConceptSymbolEntry
  | DeductionGuideTemplateSymbolEntry
  | FunctionFullSpecializationSymbolEntry
  | ClassFullSpecializationSymbolEntry
  | VariableFullSpecializationSymbolEntry
  | ClassPartialSpecializationSymbolEntry
  | VariablePartialSpecializationSymbolEntry;

export type ClassMemberEntry = Exclude<
  SymbolEntry,
  | MacroSymbolEntry
  | FunctionLikeMacroSymbolEntry
  | UsingDirectiveSymbolEntry
  | NamespaceAliasSymbolEntry
  | ConceptSymbolEntry
>;

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

export interface Header {
  filename: string;
  headerName: string;
  synopsis: Codeblock;
  classDefinitions: Codeblock[];
}
export interface Codeblock {
  isSynopsis: boolean;
  sectionTitle: string;
  sectionId: string;
  code: string;
}

export interface PreprocessedHeader extends Header {
  includes: Set<string>;
  synopsis: PreprocessedCodeblock;
  classDefinitions: PreprocessedCodeblock[];
}
export interface PreprocessedCodeblock extends Codeblock {
  preprocessedCode: string;
  macroSymbols: (MacroSymbolEntry | FunctionLikeMacroSymbolEntry)[];
}

export interface SymbolTableEntry {
  symbol: SymbolEntry;
  header: string;
}

export interface HeaderIndex {
  header: string;
  symbols: SymbolEntry[];
}

export interface IndexOutput {
  version: string;
  generated_at: string;
  headers: HeaderIndex[];
}
