import { expect, test } from "bun:test";
import { Lexer } from "../src/cxx/lexer";
import { Parser } from "../src/cxx/parser";

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

test("full specialization of namespace-scoped class without forward declaration", () => {
  const code = `
namespace N {
  template<typename T>
  struct S {};
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

test("full specialization of class-member class without forward declaration", () => {
  const code = `
class Outer {
  template<typename T>
  struct Inner {};
};

template<>
struct Outer::Inner<int> {};
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[1]).toMatchObject({
    kind: "class",
    name: "Outer",
    members: [
      {
        kind: "classFullSpecialization",
        name: "Inner",
        templateArgs: ["int"],
      },
    ],
  });
});

test("partial specialization of class-member class without forward declaration", () => {
  const code = `
class Outer {
  template<typename T, typename U>
  struct Inner {};
};

template<typename T>
struct Outer::Inner<T, int> {};
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[1]).toMatchObject({
    kind: "class",
    name: "Outer",
    members: [
      {
        kind: "classPartialSpecialization",
        name: "Inner",
        templateArgs: ["T", "int"],
      },
    ],
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
});

test("complex concept definition", () => {
  const code = String.raw`
namespace std::ranges {
  template<class Val, class CharT, class Traits>
    concept StreamExtractable = requires(basic_istream<CharT, Traits>& is, Val& t) {
      is >> t;
    };
}`;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[0]).toMatchObject({
    kind: "concept",
    name: "StreamExtractable",
  });
});

test("sizeof... correctly skipped as identifier", () => {
  const code = String.raw`
template<typename... Args>
void foo(int t = sizeof...(Args));
  `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[0]).toMatchObject({
    kind: "functionTemplate",
    name: "foo",
    templateParams: [{ kind: "type", name: "Args", pack: true }],
    parameters: [{ type: "int", name: "t", defaultArg: "sizeof...(Args)" }],
  });
});

test("friend type declaration", () => {
  const code = String.raw`
class A {};
class B {};
class C {};
template <typename... Ts>
class D {
  friend class A, B;
  friend Ts..., class C;
};
`;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  const symbols = parser.parseTopLevel();
  expect(symbols[3]).toMatchObject({
    kind: "classTemplate",
    name: "D",
    members: [
      {
        kind: "friendType",
        targetType: "A",
      },
      {
        kind: "friendType",
        targetType: "B",
      },
      {
        kind: "friendType",
        targetType: "Ts",
        expand: true,
      },
      {
        kind: "friendType",
        targetType: "C",
      },
    ],
  });
});
