import { Nav } from "@/components/Nav";
import { CashtagInput } from "@/components/CashtagInput";
import { ScanResults } from "@/components/ScanResults";

interface PageProps {
  searchParams: Promise<{ ticker?: string; hours?: string }>;
}

export default async function ScanPage({ searchParams }: PageProps) {
  const { ticker, hours } = await searchParams;
  const t = (ticker ?? "").trim().replace(/^\$/, "").toUpperCase();
  const h = Math.min(168, Math.max(1, Number(hours) || 24));

  return (
    <main className="min-h-screen pb-32">
      <Nav />

      <section className="mx-auto max-w-5xl px-6 pt-10 sm:pt-14">
        <div className="mb-8">
          <CashtagInput />
        </div>

        {t ? (
          <ScanResults ticker={t} hours={h} />
        ) : (
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] p-8 text-center">
            <div className="text-[14px] text-[color:var(--color-fg-muted)]">
              Paste a cashtag above to start a scan.
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
