import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="text-center">
        <p className="text-sm font-medium text-blue-700">404</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">The page you’re looking for doesn’t exist or was removed.</p>
        <Link href="/" className="mt-4 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
          Go home
        </Link>
      </div>
    </main>
  );
}
