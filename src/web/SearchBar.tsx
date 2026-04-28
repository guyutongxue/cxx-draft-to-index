import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export function SearchBar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(urlQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlRef = useRef(urlQuery);

  useEffect(() => {
    if (urlQuery !== lastUrlRef.current) {
      setInputValue(urlQuery);
      lastUrlRef.current = urlQuery;
    }
  }, [urlQuery]);

  const debouncedSetQuery = (v: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (v) {
        setSearchParams({ q: v }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }, 200);
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          const v = e.target.value;
          setInputValue(v);
          debouncedSetQuery(v);
        }}
        placeholder='Search symbols by name (e.g. "vector", "begin", "is_same")'
        autoFocus
      />
    </div>
  );
}
