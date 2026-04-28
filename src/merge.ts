import { computeSymbolId } from "./share/symbol_id";
import type {
  ClassMemberEntry,
  EnumSymbolEntry,
  SymbolEntry,
  TemplateParameter,
} from "./share/types";

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
  return mergeSymbolsImpl(symbols);
}

function mergeSymbolsImpl(symbols: readonly SymbolEntry[]): SymbolEntry[] {
  const result: SymbolEntry[] = [];
  const keys: (string | null)[] = [];
  for (const symbol of symbols) {
    const key = computeSymbolId(symbol);
    const existingIndex = keys.indexOf(key);
    if (existingIndex !== -1) {
      const existingSymbol = result[existingIndex] as MergeEligibleSymbol;
      result[existingIndex] = mergeSingleSymbol(
        existingSymbol,
        symbol as MergeEligibleSymbol,
      );
    } else {
      keys.push(key);
      result.push(symbol);
    }
  }
  return result;
}

function mergeSingleSymbol<T extends MergeEligibleSymbol>(
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
    let members: ClassMemberEntry[] | null;
    if (incoming.members && exists.members) {
      members = mergeSymbolsImpl([
        ...exists.members,
        ...incoming.members,
      ]) as ClassMemberEntry[];
    } else if (incoming.members) {
      members = incoming.members;
    } else {
      members = exists.members;
    }

    const merged = { ...exists, members };
    if (incoming.members) {
      merged.raw = incoming.raw;
    }
    return merged;
  }
  return exists;
}

function isClassLike(
  symbol: MergeEligibleSymbol,
): symbol is Exclude<MergeEligibleSymbol, EnumSymbolEntry> {
  return "members" in symbol;
}
