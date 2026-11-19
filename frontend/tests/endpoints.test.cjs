const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function endpoints(env) {
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/endpoints.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env }, URL });
  return exports;
}

test("normalizes REST origin and derives matching WebSocket endpoint", () => {
  const api = endpoints({ NEXT_PUBLIC_API_URL: "https://alpr.example/api/v1/" });
  assert.equal(api.API_BASE_URL, "https://alpr.example/api/v1");
  assert.equal(api.BACKEND_ORIGIN, "https://alpr.example");
  assert.equal(api.websocketUrl(), "wss://alpr.example/api/v1/ws");
});

test("custom WS origin has exactly one slash and preserves explicit endpoint", () => {
  for (const url of ["ws://localhost:8000", "ws://localhost:8000/", "http://localhost:8000"]) {
    assert.equal(endpoints({ NEXT_PUBLIC_WS_URL: url }).websocketUrl(), "ws://localhost:8000/ws");
  }
  assert.equal(endpoints({ NEXT_PUBLIC_WS_URL: "wss://alpr.example/api/v1/ws/" }).websocketUrl(),
    "wss://alpr.example/api/v1/ws");
});

test("accepts a backend origin without the REST prefix", () => {
  const api = endpoints({ NEXT_PUBLIC_API_URL: "http://127.0.0.1:9000/" });
  assert.equal(api.API_BASE_URL, "http://127.0.0.1:9000/api/v1");
  assert.equal(api.websocketUrl(), "ws://127.0.0.1:9000/api/v1/ws");
});
