import type { ClassMemberEntry, EnumSymbolEntry, SymbolEntry } from "./types";

type MergeEligibleSymbol = Extract<
  SymbolEntry,
  {
    kind:
      | "class"
      | "struct"
      | "union"
      | "classTemplate"
      | "partialTemplateSpecialization"
      | "fullTemplateSpecialization"
      | "enum";
  }
>;

export function mergeSymbols(symbols: readonly SymbolEntry[]): SymbolEntry[] {
  return mergeSymbolsImpl([], symbols);
}

function mergeSymbolsImpl(
  scope: string[],
  symbols: readonly SymbolEntry[],
): SymbolEntry[] {
  const result: SymbolEntry[] = [];
  const keys: (string | null)[] = [];
  for (const symbol of symbols) {
    const key = mergeKey(symbol, scope);
    if (key) {
      const existingIndex = keys.indexOf(key);
      if (existingIndex !== -1) {
        // Merge with existing symbol
        const existingSymbol = result[existingIndex] as MergeEligibleSymbol;
        result[existingIndex] = mergeSingleSymbol(
          scope,
          existingSymbol,
          symbol as MergeEligibleSymbol,
        );
      } else {
        // New symbol
        keys.push(key);
        result.push(symbol);
      }
    } else {
      // Not eligible for merging, just add it
      keys.push(null);
      result.push(symbol);
    }
  }
  return result;
}

function mergeSingleSymbol<T extends MergeEligibleSymbol>(
  scope: string[],
  exists: T,
  incoming: T,
): T {
  if (exists.kind === "enum" && incoming.kind === "enum") {
    return {
      ...exists,
      enumerators: exists.enumerators ?? incoming.enumerators,
    };
  }

  if (isClassLike(exists) && isClassLike(incoming) && incoming.members) {
    const members = mergeSymbolsImpl(
      [...scope, exists.name],
      [...(exists.members ?? []), ...incoming.members],
    );
    return {
      ...exists,
      members,
    };
  }
  return exists;
}

function mergeKey(symbol: SymbolEntry, parentScope: string[]): string | null {
  if (!isMergeTarget(symbol)) {
    return null;
  }
  const qualifiedName = [...parentScope, symbol.name].join("::");
  const keyParts = [symbol.kind, symbol.namespace, qualifiedName];
  if (
    symbol.kind === "partialTemplateSpecialization" ||
    symbol.kind === "fullTemplateSpecialization"
  ) {
    keyParts.push(symbol.templateArgs.join(","));
  }
  return keyParts.join("\u0000");
}

function isMergeTarget(symbol: SymbolEntry): symbol is MergeEligibleSymbol {
  return (
    symbol.kind === "class" ||
    symbol.kind === "struct" ||
    symbol.kind === "union" ||
    symbol.kind === "classTemplate" ||
    (symbol.kind === "partialTemplateSpecialization" &&
      symbol.templateKind === "class") ||
    (symbol.kind === "fullTemplateSpecialization" &&
      symbol.templateKind === "class") ||
    symbol.kind === "enum"
  );
}

function isClassLike(
  symbol: MergeEligibleSymbol,
): symbol is Exclude<MergeEligibleSymbol, EnumSymbolEntry> {
  return symbol.kind !== "enum";
}
