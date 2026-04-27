import { expect, test } from "bun:test";
import { Lexer } from "../src/cxx/lexer";

test("lexer handles backslash char literal", () => {
  const lexer = new Lexer("'\\\\'");
  expect(lexer.tok.value).toBe("'\\\\'");
  expect(lexer.tok.isEof()).toBe(false);
  expect(lexer.next().isEof()).toBe(true);
});
