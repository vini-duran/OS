const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertWritableDataOutsideApp,
  isPathInside,
  runtimeExecutable,
} = require("./desktop-paths.cjs");

test("seleciona o executável Node apropriado para cada plataforma", () => {
  assert.equal(runtimeExecutable("/runtime", "darwin"), "/runtime/node");
  assert.equal(runtimeExecutable("/runtime", "linux"), "/runtime/node");
  assert.equal(runtimeExecutable("C:\\runtime", "win32"), "C:\\runtime/node.exe");
});

test("não permite dados dentro do pacote do aplicativo", () => {
  assert.equal(isPathInside("/Applications/ContentFlow OS.app", "/Applications/ContentFlow OS.app/data"), true);
  assert.equal(isPathInside("/Applications/ContentFlow OS.app", "/Users/example/Library/Application Support/ContentFlow OS/data"), false);
  assert.throws(() =>
    assertWritableDataOutsideApp("/Applications/ContentFlow OS.app", "/Applications/ContentFlow OS.app/data"),
  );
});
