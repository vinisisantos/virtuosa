import { spawnSync } from "node:child_process";

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false, env });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) process.exit(1);
  run("npx", ["prisma", "migrate", "deploy"], {
    ...process.env,
    // O host direto do Supabase é IPv6 e não é alcançável no build da Vercel.
    // A migration usa temporariamente o pooler já configurado em DATABASE_URL.
    DIRECT_URL: process.env.DATABASE_URL,
  });
}

run("npm", ["run", "build"]);
