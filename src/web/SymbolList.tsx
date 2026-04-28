import { SymbolCard } from "./SymbolCard";
import type { FlatSymbol } from "./App";

interface SymbolListProps {
  symbols: FlatSymbol[];
  selected: FlatSymbol | null;
  onSelect: (fs: FlatSymbol) => void;
  isEmpty: boolean;
  searchQuery: string;
}

export function SymbolList({
  symbols,
  selected,
  onSelect,
  isEmpty,
  searchQuery,
}: SymbolListProps) {
  if (isEmpty) {
    return (
      <div className="symbol-list-panel">
        <div className="symbol-list-empty">No symbols loaded.</div>
      </div>
    );
  }

  if (searchQuery && symbols.length === 0) {
    return (
      <div className="symbol-list-panel">
        <div className="symbol-list-empty">
          No symbols match <strong>&ldquo;{searchQuery}&rdquo;</strong>
          <p>Try a different search term.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="symbol-list-panel">
      {symbols.map((fs, i) => {
        const key = `${fs.header}:${fs.symbol.name}:${i}`;
        return (
          <SymbolCard
            key={key}
            fs={fs}
            selected={
              selected !== null &&
              selected.header === fs.header &&
              selected.symbol.name === fs.symbol.name &&
              selected.symbol.kind === fs.symbol.kind
            }
            onClick={() => onSelect(fs)}
          />
        );
      })}
    </div>
  );
}
