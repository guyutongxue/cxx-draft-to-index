import { expect, test } from "bun:test";
import { Lexer } from "../src/cxx/lexer";
import { Parser } from "../src/cxx/parser";

test("lexer handles backslash char literal", () => {
  const lexer = new Lexer("'\\\\'");
  expect(lexer.tok.value).toBe("'\\\\'");
  expect(lexer.tok.isEof()).toBe(false);
  expect(lexer.next().isEof()).toBe(true);
});

test("ctor disambiguation failed should die", () => {
  const code = `
using T = int;
class C {
  C(T);
};
C::C(T) {};
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  expect(() => parser.parseTopLevel()).toThrowError("Disambiguate failure");
});

test("specialization of scoped", () => {
  const code = `
namespace N {
  template<typename T>
  struct S {};

  template<>
  struct S<int>;
}

template<>
struct N::S<int> {};
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[1]).toMatchObject({
    kind: "classFullSpecialization",
    name: "S",
    namespace: [{ name: "N" }],
    templateArgs: ["int"],
  });
});

test("complex declarator", () => {
  const code = `
volatile int (*const ptrArr)[42];
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[0]).toMatchObject({
    kind: "variable",
    name: "ptrArr",
    type: "volatile int (*const)[42]",
  });
});

test("language linkage", () => {
  const code = `
namespace std {
  // Exposition-only function type aliases
  extern "C" using @\\placeholdernc{c-atexit-handler}@ = void();  
}`;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[0]).toMatchObject({
    kind: "typeAlias",
    name: "__c_atexit_handler",
    languageLinkage: "C",
  });
})

test("complex concept definition", () => {
  const code = String.raw`
namespace std::ranges {
  template<class Val, class CharT, class Traits>
    concept StreamExtractable = requires(basic_istream<CharT, Traits>& is, Val& t) {
      is >> t;
    };
}`
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[0]).toMatchObject({
    kind: "concept",
    name: "StreamExtractable",  
  });
})

test("debug", () => {
  const code = String.raw`
namespace std::ranges {
  template<@\libconcept{input_range}@ V, @\libconcept{indirect_unary_predicate}@<iterator_t<V>> Pred>
    requires @\libconcept{view}@<V> && is_object_v<Pred>
  template<bool Const>
  class filter_view<V, Pred>::@\exposid{sentinel}@ {
  public:
    @\exposid{sentinel}@() = default;
    constexpr @\exposid{sentinel}@(@\exposid{sentinel}@<!Const> other)
      requires Const && @\libconcept{convertible_to}@<sentinel_t<V>, sentinel_t<@\exposidnc{Base}@>>

    constexpr sentinel_t<@\exposidnc{Base}@> base() const;

  };
}`
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
})