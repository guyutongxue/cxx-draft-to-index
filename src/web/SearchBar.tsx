interface SearchBarProps {
  query: string;
  onChange: (value: string) => void;
}

export function SearchBar({ query, onChange }: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder='Search symbols by name (e.g. "vector", "begin", "is_same")'
        autoFocus
      />
    </div>
  );
}
