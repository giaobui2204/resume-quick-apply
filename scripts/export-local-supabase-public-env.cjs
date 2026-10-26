const { appendFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const status = spawnSync("npm", ["exec", "--", "supabase", "status", "-o", "env"], {
  encoding: "utf8"
});
if (status.status !== 0) throw new Error(status.stderr || "Could not read local Supabase status.");

const values = {};
for (const line of status.stdout.split("\n")) {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  if (match) values[match[1]] = match[2];
}
if (!values.API_URL || !values.PUBLISHABLE_KEY) {
  throw new Error("Local Supabase did not provide its API URL and publishable key.");
}

const output = process.env.GITHUB_ENV;
if (!output) throw new Error("GITHUB_ENV is required to export the local public configuration.");
appendFileSync(
  output,
  `NEXT_PUBLIC_SUPABASE_URL=${values.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${values.PUBLISHABLE_KEY}\nNEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false\nNEXT_PUBLIC_AUTH_APPLE_ENABLED=false\nNEXT_PUBLIC_AUTH_EMAIL_ENABLED=false\n`
);
