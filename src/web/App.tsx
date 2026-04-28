import { useState, useEffect, useMemo } from "react";
import type { IndexOutput, SymbolEntry } from "../types";
import { SearchBar } from "./SearchBar";
import { SymbolList } from "./SymbolList";
import { SymbolDetail } from "./SymbolDetail";

export interface FlatSymbol {
  symbol: SymbolEntry;
  header: string;
}

function flattenIndex(data: IndexOutput): FlatSymbol[] {
  const result: FlatSymbol[] = [];
  for (const hdr of data.headers) {
    for (const sym of hdr.symbols) {
      result.push({ symbol: sym, header: hdr.header });
    }
  }
  return result;
}

export function App() {
  const [data, setData] = useState<IndexOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<FlatSymbol | null>(null);

  useEffect(() => {
    fetch("/api/data")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<IndexOutput>;
      })
      .then((json) => setData(json))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const allSymbols = useMemo(() => (data ? flattenIndex(data) : []), [data]);

  const filteredSymbols = useMemo(() => {
    if (!searchQuery.trim()) return allSymbols;
    const q = searchQuery.toLowerCase();
    return allSymbols.filter((fs) =>
      fs.symbol.name.toLowerCase().includes(q),
    );
  }, [allSymbols, searchQuery]);

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
    <div className="app">
      <div className="app-header">
        <span className="app-title">C++ Standard Library Index</span>
        <span className="app-stats">
          {data?.headers.length ?? 0} headers, {allSymbols.length} symbols
        </span>
      </div>
      <SearchBar query={searchQuery} onChange={setSearchQuery} />
      <div className="main-content">
        <SymbolList
          symbols={filteredSymbols}
          selected={selectedSymbol}
          onSelect={setSelectedSymbol}
          isEmpty={allSymbols.length === 0}
          searchQuery={searchQuery}
        />
        <SymbolDetail selected={selectedSymbol} onSelect={setSelectedSymbol} />
      </div>
    </div>
  );
}
