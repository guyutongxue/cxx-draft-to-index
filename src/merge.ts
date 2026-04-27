import type { ClassMemberEntry, EnumSymbolEntry, SymbolEntry } from "./types";

type MergeEligibleSymbol = Extract<
  SymbolEntry,
  {
    kind:
      | "class"
      | "union"
      | "classTemplate"
      | "classPartialSpecialization"
      | "classFullSpecialization"
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
    if (key !== null) {
      const existingIndex = keys.indexOf(key);
      if (existingIndex !== -1) {
        const existingSymbol = result[existingIndex] as MergeEligibleSymbol;
        result[existingIndex] = mergeSingleSymbol(
          scope,
          existingSymbol,
          symbol as MergeEligibleSymbol,
        );
      } else {
        keys.push(key);
        result.push(symbol);
      }
    } else {
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
    const isDefinition = incoming.enumerators !== null;
    return {
      ...exists,
      ...(isDefinition ? { raw: incoming.raw } : {}),
      enumerators: exists.enumerators ?? incoming.enumerators,
    };
  }

  if (isClassLike(exists) && isClassLike(incoming)) {
    const isDefinition = incoming.members !== null;

    let members: ClassMemberEntry[] | null;
    if (isDefinition && exists.members) {
      members = mergeSymbolsImpl(
        [...scope, exists.name],
        [...exists.members, ...incoming.members!],
      ) as ClassMemberEntry[];
    } else if (isDefinition) {
      members = incoming.members;
    } else {
      members = exists.members;
    }

    const merged = { ...exists, members };
    if (isDefinition) {
      merged.raw = incoming.raw;
    }
    return merged;
  }
  return exists;
}

function mergeKey(symbol: SymbolEntry, parentScope: string[]): string | null {
  if (!isMergeTarget(symbol)) {
    return null;
  }
  const namespaceStr = symbol.namespace
    .map((n) => n.name ?? "(anon)")
    .join("::");
  const qualifiedName = [...parentScope, symbol.name].join("::");
  const keyParts = [symbol.kind, namespaceStr, qualifiedName];
  if (
    symbol.kind === "classTemplate" ||
    symbol.kind === "classPartialSpecialization"
  ) {
    keyParts.push(
      symbol.templateParams.map((p) => p.name ?? "(anon)").join(","),
    );
  }
  if (
    symbol.kind === "classPartialSpecialization" ||
    symbol.kind === "classFullSpecialization"
  ) {
    keyParts.push(symbol.templateArgs.join(","));
  }
  return keyParts.join("\u0000");
}

function isMergeTarget(symbol: SymbolEntry): symbol is MergeEligibleSymbol {
  return (
    symbol.kind === "class" ||
    symbol.kind === "union" ||
    symbol.kind === "classTemplate" ||
    symbol.kind === "classPartialSpecialization" ||
    symbol.kind === "classFullSpecialization" ||
    symbol.kind === "enum"
  );
}

function isClassLike(
  symbol: MergeEligibleSymbol,
): symbol is Exclude<MergeEligibleSymbol, EnumSymbolEntry> {
  return symbol.kind !== "enum";
}
