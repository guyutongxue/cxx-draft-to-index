export type SymbolKind =
  | "class"
  | "struct"
  | "union"
  | "enum"
  | "enum_class"
  | "typedef"
  | "type_alias"
  | "concept"
  | "function"
  | "function_template"
  | "variable"
  | "variable_template"
  | "namespace"
  | "macro"
  | "operator"
  | "conversion_operator"
  | "constructor"
  | "destructor"
  | "using_declaration"
  | "namespace_alias"
  | "static_assert"
  | "extern_block";

export interface SymbolEntry {
  header: string;
  namespace: string;
  name: string;
  kind: SymbolKind;
  template_params?: string;
  type_info?: string;
  raw: string;
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