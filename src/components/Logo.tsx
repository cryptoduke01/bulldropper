export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M2 12 Q 2 6 9 6 L 14 6 Q 22 6 22 12 Q 22 18 14 18 L 9 18 Q 2 18 2 12 Z"
          stroke="var(--color-accent)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="6" cy="12" r="1.5" fill="var(--color-accent)" />
        <path d="M14 12 L 21 9 L 21 15 Z" fill="var(--color-accent)" />
      </svg>
      <span className="font-semibold tracking-tight text-[15px]">Bulldropper</span>
    </div>
  );
}
