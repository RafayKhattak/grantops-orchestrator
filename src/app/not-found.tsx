import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="display text-4xl">Page not found</h1>
      <Link href="/" className="mt-4 inline-flex text-sm text-ink underline underline-offset-4">
        Back to the pipeline
      </Link>
    </div>
  );
}
