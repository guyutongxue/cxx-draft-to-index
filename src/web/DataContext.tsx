import { createContext, useContext, useState, useEffect } from "react";
import type { IndexOutput, SymbolEntry } from "../types";
import { computeSymbolId } from "./symbol_id";

const API_URL = "/std-index.json";

export interface FlatSymbol {
  symbol: SymbolEntry;
  header: string;
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

function flattenIndex(data: IndexOutput): FlatSymbol[] {
  const result: FlatSymbol[] = [];
  for (const hdr of data.headers) {
    for (const sym of hdr.symbols) {
      result.push({ symbol: sym, header: hdr.header });
    }
  }
  return result;
}

function buildTopLevelMap(symbols: FlatSymbol[]): Map<string, FlatSymbol> {
  const map = new Map<string, FlatSymbol>();
  for (const fs of symbols) {
    const id = computeSymbolId(fs.symbol);
    map.set(id, fs);
  }
  return map;
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
        const symbols = flattenIndex(json);
        setAllSymbols(symbols);
        setTopLevelMap(buildTopLevelMap(symbols));
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
