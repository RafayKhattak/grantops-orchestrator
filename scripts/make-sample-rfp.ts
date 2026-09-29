import fs from "node:fs/promises";
import path from "node:path";
import { SAMPLE_PAGES, buildTextPdf } from "./text-pdf";

async function main() {
  const target = path.join(process.cwd(), "fixtures", "sample-rfp.pdf");
  const bytes = await buildTextPdf(SAMPLE_PAGES);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  console.log(`Wrote ${target}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
