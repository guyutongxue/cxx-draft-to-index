import { createContext, useContext, useState, useEffect } from "react";
import type { IndexOutput, NamespaceInfo, SymbolEntry } from "../share/types";
import { computeSymbolId } from "../share/symbol_id";

const API_URL = "/std-index.json";

export interface FlatSymbol {
  symbol: SymbolEntry;
  key: string;
  headers: string[];
}

export interface DataContextValue {
  data: IndexOutput | null;
  allSymbols: FlatSymbol[];
  topLevelMap: Map<string, FlatSymbol>;
}

const DataContext = createContext<DataContextValue>({
  data: null,
  allSymbols: [],
  topLevelMap: new Map(),
});
const overloadSetSize = new Map<string, number>();

export function namespacePath(ns: NamespaceInfo[]): string {
  return ns.map((n) => n.name ?? "⟨anonymous⟩").join("::");
}

const getScopedName = (sym: SymbolEntry): string => {
  return `${namespacePath(sym.namespace)}::${sym.name}`;
};

function buildTopLevelMap(data: IndexOutput): Map<string, FlatSymbol> {
  const map = new Map<string, FlatSymbol>();
  for (const hdr of data.headers) {
    for (const sym of hdr.symbols) {
      const key = computeSymbolId(sym);
      if (map.has(key)) {
        const existing = map.get(key)!;
        if (!existing.headers.includes(hdr.header)) {
          existing.headers.push(hdr.header);
          if (sym.raw.length >= existing.symbol.raw.length) {
            existing.symbol = sym;
          }
        } else {
          console.warn(
            `Duplicate symbol ID ${key} in header ${hdr.header}`,
            existing.symbol,
            sym,
          );
        }
      } else {
        map.set(key, { symbol: sym, headers: [hdr.header], key });
        const scopedName = getScopedName(sym);
        overloadSetSize.set(
          scopedName,
          (overloadSetSize.get(scopedName) ?? 0) + 1,
        );
      }
    }
  }
  return map;
}

export function hasOverloads(symbol: SymbolEntry): boolean {
  const scopedName = getScopedName(symbol);
  return (overloadSetSize.get(scopedName) ?? 0) > 1;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<IndexOutput | null>(null);
  const [allSymbols, setAllSymbols] = useState<FlatSymbol[]>([]);
  const [topLevelMap, setTopLevelMap] = useState<Map<string, FlatSymbol>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(API_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<IndexOutput>;
      })
      .then((json) => {
        setData(json);
        const map = buildTopLevelMap(json);
        setTopLevelMap(map);
        setAllSymbols([...map.values()]);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading standard library index...
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-view">
        <div>Failed to load index data</div>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <DataContext.Provider value={{ data, allSymbols, topLevelMap }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  return useContext(DataContext);
}
