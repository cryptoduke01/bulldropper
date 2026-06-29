import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Bulldropper — Airdrop to viral posters";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#0a0a0b",
          padding: "80px 100px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Logo + Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 12 Q 2 6 9 6 L 14 6 Q 22 6 22 12 Q 22 18 14 18 L 9 18 Q 2 18 2 12 Z"
              stroke="#ff5419"
              strokeWidth="1.6"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="6" cy="12" r="2" fill="#ff5419" />
            <path d="M14 12 L 21 9 L 21 15 Z" fill="#ff5419" />
          </svg>
          <span
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#fafafa",
              letterSpacing: "-0.02em",
            }}
          >
            Bulldropper
          </span>
        </div>

        {/* Main headline */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#fafafa",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: 900,
            marginBottom: 24,
          }}
        >
          Drop your token on<br />the people who made<br />
          <span style={{ color: "#ff5419" }}>it loud.</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            maxWidth: 700,
            lineHeight: 1.3,
          }}
        >
          Scan X for viral posters. Surface wallets.<br />
          Ship custody-free Solana airdrops.
        </div>

        {/* Accent bar */}
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 100,
            height: 4,
            width: 120,
            backgroundColor: "#ff5419",
            borderRadius: 2,
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
