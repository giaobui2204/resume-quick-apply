const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const source = readFileSync(require.resolve("./release-main.cjs"), "utf8");
const sha = "a".repeat(40);
function run({ existing = false, badCommit = false, network = false, runNumber = "42" } = {}) {
  const calls = [];
  const output = [];
  const execute = () =>
    vm.runInNewContext(source, {
      require(name) {
        if (name === "../package.json") return { version: "0.1.0" };
        return {
          execFileSync(tool, args) {
            calls.push([tool, ...args]);
            if (tool === "git") {
              if (existing) return badCommit ? "b".repeat(40) : sha;
              const error = new Error("missing tag");
              error.status = 128;
              throw error;
            }
            if (args[1] === "view") {
              if (network) {
                const error = new Error("network");
                error.stderr = "connection failed";
                throw error;
              }
              if (existing) return JSON.stringify({ tagName: "v0.1.42", targetCommitish: sha });
              const error = new Error("missing release");
              error.stderr = "release not found";
              throw error;
            }
            return "";
          }
        };
      },
      process: {
        env: { RELEASE_RUN: runNumber, RELEASE_SHA: sha },
        stdout: { write: (text) => output.push(text) }
      }
    });
  return { execute, calls, output };
}
test("creates generated notes for the exact validated commit with a run-stable patch tag", () => {
  const result = run();
  result.execute();
  assert.deepEqual(result.calls.at(-1), [
    "gh",
    "release",
    "create",
    "v0.1.42",
    "--target",
    sha,
    "--title",
    "v0.1.42",
    "--generate-notes"
  ]);
});
test("rerunning the same workflow never creates a second release", () => {
  const result = run({ existing: true });
  result.execute();
  assert.equal(
    result.calls.some((call) => call[2] === "create"),
    false
  );
});
test("refuses an existing release for another commit", () => {
  const result = run({ existing: true, badCommit: true });
  assert.throws(result.execute, /another commit/);
});
test("does not create a release when lookup fails due to connectivity", () => {
  const result = run({ network: true });
  assert.throws(result.execute, /network/);
  assert.equal(result.calls.length, 1);
});
test("rejects an invalid run number before invoking GitHub", () => {
  const result = run({ runNumber: "42;injected" });
  assert.throws(result.execute, /Invalid release/);
  assert.equal(result.calls.length, 0);
});
