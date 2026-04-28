import type { SymbolEntry, TemplateParameter, Parameter } from "../types";

function templateParamKey(param: TemplateParameter): string {
  return (
    (param.templateParams
      ? `template<${param.templateParams.map((tt) => tt.raw).join(",")}>${param.kind === "ttConcept" ? "concept" : param.kind === "ttType" ? "class" : "auto"}`
      : param.type || "typename") + (param.pack ? "..." : "")
  );
}

function paramsKey(params: (Parameter | string)[]): string {
  return params.map((p) => (typeof p === "string" ? p : p.type)).join(",");
}

function computeIdImpl(
  symbol: SymbolEntry,
  namespace: string | null,
): string {
  let id = "";
  if (namespace) {
    id += namespace + "::";
  }
  id += symbol.name;
  if ("templateParams" in symbol && symbol.templateParams.length > 0) {
    id += `<${symbol.templateParams.map((tp) => templateParamKey(tp)).join(",")}>`;
  }
  if ("templateArgs" in symbol) {
     id += `<${symbol.templateArgs.join(",")}>`;
  }
  if ("parameters" in symbol) {
    id += `(${paramsKey(symbol.parameters)})`;
  }
  return id;
}

export function computeSymbolId(symbol: SymbolEntry): string {
  const ns = symbol.namespace.map((n) => n.name ?? "(anon)").join("::");
  return computeIdImpl(symbol, ns);
}

export function computeMemberLocalId(symbol: SymbolEntry): string {
  return computeIdImpl(symbol, null);
}
