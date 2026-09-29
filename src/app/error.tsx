"use client";

export default function AppErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h1 className="display text-4xl">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 h-8 rounded-[6px] bg-ink px-3 text-[13px] font-medium text-paper"
      >
        Try again
      </button>
    </div>
  );
}
