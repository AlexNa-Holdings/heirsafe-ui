export default function Logo({ className = "" }: { className?: string }) {
  // "Shield + keyhole" mark for HeirSafe
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-label="HeirSafe logo"
      role="img"
    >
      <defs>
        <linearGradient id="hs-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.65" />
        </linearGradient>
      </defs>
      {/* shield */}
      <path
        d="M16 3.5l9 3v8.2c0 5.7-3.9 10.9-9 12.8-5.1-1.9-9-7.1-9-12.8V6.5l9-3z"
        fill="none"
        stroke="url(#hs-grad)"
        strokeWidth="1.6"
      />
      {/* keyhole / heir dot */}
      <circle cx="16" cy="14" r="2.2" fill="currentColor" />
      <path
        d="M16 16.2v5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
