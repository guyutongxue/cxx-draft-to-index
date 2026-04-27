export type Props = Record<string, unknown>;
export type Child = string | number | boolean | null | undefined | Child[];
export type FC<P extends Props = Props> = (
  props: P & { children?: Child },
) => string;

// Declare JSX namespace so TypeScript understands .tsx files.
declare global {
  namespace JSX {
    type Element = string;
    interface IntrinsicElements {
      // Accept any HTML element with any props.
      [elemName: string]: Record<string, unknown>;
    }
    interface ElementChildrenAttribute {
      children: Record<string, never>;
    }
  }
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// JSX prop names that differ from HTML attribute names.
const ATTR_MAP: Record<string, string> = {
  className: "class",
  htmlFor: "for",
};

/**
 * Escape a string for safe use as an HTML attribute value.
 * Also exported for use in client-side script strings embedded in HTML.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Recursively flatten a nested Child array into a flat array of primitives.
 */
function flatChildren(children: Child[]): (string | number | boolean | null | undefined)[] {
  const result: (string | number | boolean | null | undefined)[] = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flatChildren(child));
    } else {
      result.push(child);
    }
  }
  return result;
}

/**
 * Flatten and join children into a string.
 * Children are already-rendered HTML strings (from h() calls) or primitive
 * literals; they are NOT re-escaped here.  Callers that embed dynamic text
 * content must use escapeHtml() themselves.
 */
function flattenChildren(children: Child[]): string {
  return flatChildren(children)
    .map((child) => {
      if (child === null || child === undefined || child === false || child === true) {
        return "";
      }
      return String(child);
    })
    .join("");
}

/**
 * JSX factory — renders JSX to an HTML string.
 * Use via `/** @jsx h *\/` pragma or `jsxFactory` in tsconfig.
 */
export function h(
  tag: string | FC,
  props: Props | null,
  ...children: Child[]
): string {
  if (typeof tag === "function") {
    // Pass children either from props (static) or rest args (JSX children).
    const childrenProp =
      (props as { children?: Child } | null)?.children ?? children;
    return tag({ ...(props ?? {}), children: childrenProp });
  }

  const attrStr = props
    ? Object.entries(props)
        .filter(([k]) => k !== "children")
        .map(([k, v]) => {
          const attrName = ATTR_MAP[k] ?? k;
          if (v === false || v === null || v === undefined) return "";
          if (v === true) return ` ${attrName}`;
          return ` ${attrName}="${escapeHtml(String(v))}"`;
        })
        .join("")
    : "";

  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrStr}>`;
  }

  const content = flattenChildren(children);
  return `<${tag}${attrStr}>${content}</${tag}>`;
}

export function Fragment({ children }: { children?: Child }): string {
  return flattenChildren(
    Array.isArray(children) ? (children as Child[]) : [children],
  );
}
