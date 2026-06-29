export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-fg-dim)]">404</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-[color:var(--color-fg-muted)]">The page you're looking for doesn't exist.</p>
        <a href="/" className="mt-6 inline-block rounded-full bg-[color:var(--color-accent)] px-5 py-2 text-sm font-semibold text-white">
          Go home
        </a>
      </div>
    </div>
  );
}
