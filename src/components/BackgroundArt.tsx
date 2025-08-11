export default function BackgroundArt() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          backgroundPosition: "-1px -1px",
        }}
      />

      {/* central glow (very soft) */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] rounded-full hs-anim-float"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(16,185,129,0.16), rgba(16,185,129,0.03) 55%, transparent 70%)",
          filter: "blur(40px)",
          willChange: "transform",
        }}
      />

      {/* giant blurred logo watermark (rotates s l o w l y) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hs-anim-swing" style={{ willChange: "transform" }}>
        <svg
          viewBox="0 0 32 32"
          className="w-[1000px] h-[1000px] opacity-[0.08]"
          aria-hidden
        >
          <defs>
            <linearGradient id="bg-hs-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0.7" />
            </linearGradient>
          </defs>
          <g filter="url(#blur)">
            <path
              d="M16 3.5l9 3v8.2c0 5.7-3.9 10.9-9 12.8-5.1-1.9-9-7.1-9-12.8V6.5l9-3z"
              fill="none"
              stroke="url(#bg-hs-grad)"
              strokeWidth="1.8"
            />
            <circle cx="16" cy="14" r="2.4" fill="#34d399" />
            <path
              d="M16 16.6v5.7"
              stroke="#34d399"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>

      {/* soft vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 55%, transparent 90%)",
          maskImage:
            "radial-gradient(ellipse at center, black 55%, transparent 90%)",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.00), rgba(0,0,0,0.35))",
        }}
      />
    </div>
  );
}
