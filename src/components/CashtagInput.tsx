"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const BASE58_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type InputMode = "ticker" | "ca" | "empty";

function classify(value: string): InputMode {
  const trimmed = value.trim().replace(/^\$/, "");
  if (!trimmed) return "empty";
  if (BASE58_ADDR.test(trimmed)) return "ca";
  return "ticker";
}

export function CashtagInput({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [hours, setHours] = useState(24);
  const [isPending, startTransition] = useTransition();

  const mode = useMemo(() => classify(value), [value]);

  const submit = () => {
    const clean = value.trim().replace(/^\$/, "");
    if (!clean) return;
    const href =
      mode === "ca"
        ? `/scan?query=${encodeURIComponent(clean)}&hours=${hours}`
        : `/scan?ticker=${encodeURIComponent(clean.toUpperCase())}&hours=${hours}`;
    startTransition(() => router.push(href));
  };

  const prefix =
    mode === "ca" ? (
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-accent)]">
        MINT
      </span>
    ) : (
      <span className="text-[color:var(--color-fg-dim)] tabular">$</span>
    );

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] p-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.4)] focus-within:border-[color:var(--color-border-strong)]">
        <div className="flex min-w-[28px] items-center justify-center pl-3">{prefix}</div>
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="ANSEM or paste a mint address"
          spellCheck={false}
          autoCapitalize={mode === "ca" ? "off" : "characters"}
          className={`flex-1 bg-transparent py-3 pr-1 text-lg outline-none placeholder:text-[color:var(--color-fg-dim)] placeholder:font-normal ${
            mode === "ca"
              ? "font-mono text-[13px] tracking-tight text-[color:var(--color-fg)]"
              : "font-medium uppercase tracking-wide text-[color:var(--color-fg)]"
          }`}
        />
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="hidden cursor-pointer appearance-none rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev-2)] px-3 py-2 text-sm text-[color:var(--color-fg-muted)] outline-none transition hover:border-[color:var(--color-border-strong)] sm:block"
        >
          <option value="6">last 6h</option>
          <option value="24">last 24h</option>
          <option value="72">last 3d</option>
          <option value="168">last 7d</option>
        </select>
        <button
          onClick={submit}
          disabled={mode === "empty" || isPending}
          className="flex items-center gap-2 rounded-xl bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isPending ? (
            <>
              <Spinner />
              <span>Scanning</span>
            </>
          ) : (
            <span>Scan →</span>
          )}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-[color:var(--color-fg-dim)]">
        <span>try</span>
        {["ANSEM", "WIF", "PNUT", "FARTCOIN"].map((t) => (
          <button
            key={t}
            onClick={() => setValue(t)}
            className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-[color:var(--color-fg-muted)] transition hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-fg)]"
          >
            ${t}
          </button>
        ))}
        <span className="mx-1 text-[color:var(--color-fg-dim)]">·</span>
        <span>or a mint address</span>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity="0.7" />
    </svg>
  );
}
