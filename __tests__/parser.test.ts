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
}

template<>
struct N::S<int> {};
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  parser.parseTopLevel();
  expect(parser.symbols[1]).toMatchObject({
    kind: "partialTemplateSpecialization",
    name: "N::S",
    templateParams: [""],
    templateArgs: ["int"],
  });
});

test("complex declarator", () => {
  const code = `
volatile int (*const ptrArr)[42];
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  parser.parseTopLevel();
  expect(parser.symbols[0]).toMatchObject({
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
  parser.parseTopLevel();
  expect(parser.symbols[0]).toMatchObject({
    kind: "typeAlias",
    name: "__c_atexit_handler",
    languageLinkage: "C",
  });
})