const { execFileSync } = require("node:child_process");
const { version } = require("../package.json");
const match = /^(\d+)\.(\d+)\.\d+$/.exec(version);
const run = process.env.RELEASE_RUN;
const sha = process.env.RELEASE_SHA;
if (!match || !/^[1-9]\d*$/.test(run ?? "") || !/^[a-f0-9]{40}$/.test(sha ?? ""))
  throw new Error("Invalid release version, run number or commit.");
const tag = `v${match[1]}.${match[2]}.${run}`;
const gh = (...args) =>
  execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
try {
  const release = JSON.parse(gh("release", "view", tag, "--json", "targetCommitish,tagName"));
  const tagged = execFileSync("git", ["rev-parse", `${release.tagName}^{commit}`], {
    encoding: "utf8"
  }).trim();
  if (tagged !== sha) throw new Error(`Release ${tag} belongs to another commit.`);
  process.stdout.write(`${tag} already exists for this commit; rerun skipped.\n`);
} catch (error) {
  // Only a genuine not-found response permits creation. Auth/network failures
  // must fail visibly rather than attempting a duplicate release.
  if (!/release not found|HTTP 404|Not Found/i.test(String(error.stderr ?? ""))) throw error;
  try {
    const existingTag = execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    if (existingTag !== sha) throw new Error(`Tag ${tag} belongs to another commit.`);
  } catch (tagError) {
    if (tagError.status !== 128) throw tagError;
  }
  gh("release", "create", tag, "--target", sha, "--title", tag, "--generate-notes");
  process.stdout.write(`Created ${tag} for ${sha}.\n`);
}
