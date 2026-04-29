import assert from "node:assert";
import { computeSymbolId } from "./share/symbol_id";
import type { ClassMemberEntry, SymbolEntry } from "./share/types";
import { produce } from "immer";

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
      const existingSymbol = result[existingIndex];
      result[existingIndex] = produce(existingSymbol, (exists) =>
        mergeSingleSymbol(key, exists, symbol),
      );
    } else {
      keys.push(key);
      result.push(symbol);
    }
  }
  return result;
}

function mergeSingleSymbol<T extends SymbolEntry>(
  key: string,
  exists: T,
  incoming: T,
): void {
  // forward declaration may discard parameter names, so we prefer the one with parameter names if exists
  if ("templateParams" in exists && "templateParams" in incoming) {
    assert(exists.templateParams.length === incoming.templateParams.length);
    for (let i = 0; i < exists.templateParams.length; i++) {
      const ep = exists.templateParams[i];
      if (!ep.name) {
        const ip = incoming.templateParams[i];
        assert(ep.kind === ip.kind);
        ep.name = ip.name;
        ep.raw = ip.raw;
      }
    }
  }
  if ("parameters" in exists && "parameters" in incoming) {
    assert(
      exists.parameters.length === incoming.parameters.length,
      `Symbol ${key} has conflicting parameter counts: ${exists.parameters.length} vs ${incoming.parameters.length}`,
    );
    for (let i = 0; i < exists.parameters.length; i++) {
      const ep = exists.parameters[i];
      if (typeof ep === "string") {
        break;
      }
      if (!ep.name) {
        const ip = incoming.parameters[i];
        assert(typeof ip !== "string");
        assert(ep.type === ip.type);
        ep.name = ip.name;
        ep.raw = ip.raw;
      }
    }
  }

  if (incoming.raw.length > exists.raw.length) {
    exists.raw = incoming.raw;
  }

  if (exists.kind === "enum" && incoming.kind === "enum") {
    exists.enumerators ??= incoming.enumerators;
  }

  if ("members" in exists && "members" in incoming) {
    exists.members = mergeSymbolsImpl([
      ...(exists.members ?? []),
      ...(incoming.members ?? []),
    ]) as ClassMemberEntry[];
  }
}
