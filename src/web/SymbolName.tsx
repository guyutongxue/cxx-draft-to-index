export function SymbolName({ name }: { name: string }) {
  let prettyName = name;
  let expositionOnly = false;
  if (name.startsWith("__") && !name.endsWith("__")) {
    prettyName = name.slice(2).replace(/(:?<=\w)_(?=\w)/g, "-");
    expositionOnly = true;
  }
  return (
    <span className={expositionOnly ? "exposition-only" : ""}>
      {prettyName}
    </span>
  );
}
