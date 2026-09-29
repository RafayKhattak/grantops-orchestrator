export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.GRANTOPS_TEST === "1") return;
  const globalState = globalThis as { grantopsDriveSync?: boolean };
  if (globalState.grantopsDriveSync) return;
  globalState.grantopsDriveSync = true;
  const tick = () => {
    Promise.all([
      import("@/server/drive-sync").then((mod) => mod.syncDriveFolder()),
      import("@/server/doc-decisions").then((mod) => mod.syncDocDecisions()),
    ]).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Background sync failed.";
      console.error(message);
    });
  };
  setTimeout(tick, 5_000);
  setInterval(tick, 10_000);
}
