import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
    >
      ← {label}
    </Link>
  );
}
