import { execSync } from "node:child_process";

export default function setup(): void {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "file:./test.db",
    },
  });
}
