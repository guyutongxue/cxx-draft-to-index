import { SubmitEvent, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export function SearchBar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = searchParams.get("q") ?? "";
    if (inputRef.current) {
      inputRef.current.value = query;
    }
  }, []);

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const query = inputRef.current?.value ?? "";
    if (query) {
      setSearchParams({ q: query }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        placeholder='Search symbols by name (e.g. "vector", "begin", "is_same")'
        autoFocus
      />
      <button type="submit">Search</button>
    </form>
  );
}
