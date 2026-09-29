import Link from "next/link";

export default function GrantNotFound() {
  return (
    <div>
      <h1 className="display text-4xl">Grant not found</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted">
        It is not in this workspace. Grants belonging to another organization are not returned.
      </p>
      <Link href="/" className="mt-4 inline-flex text-sm text-ink underline underline-offset-4">
        Back to the pipeline
      </Link>
    </div>
  );
}
