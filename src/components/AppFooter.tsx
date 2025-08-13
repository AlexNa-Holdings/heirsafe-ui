// src/components/AppFooter.tsx
import APP_VERSION from "../version";

export default function AppFooter({
  showAiCredit = false, // flip to true if you want to credit the AI helper
}: {
  showAiCredit?: boolean;
}) {
  return (
    <footer className="mt-10 border-t border-neutral-800">
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left: author info */}
        <div className="text-sm text-neutral-300">
          Written by <span className="font-medium text-neutral-100">Alex Na</span>
          {" · "}
          <a
            href="https://x.com/AlexNa"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-neutral-600 hover:decoration-neutral-300"
            title="Alex Na on X"
          >
            @AlexNa
          </a>
          {showAiCredit && (
            <>
              {" · "}
              <span className="opacity-80">Built with assistance from</span>{" "}
              <span className="font-medium">GPT-5 Thinking</span>
            </>
          )}
        </div>

        {/* Right: repo links + version */}
        <nav className="flex flex-wrap items-center gap-2">
          <a
            href="https://github.com/AlexNa-Holdings/heirsafe-module"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
            title="heirsafe-module on GitHub"
          >
            GitHub: heirsafe-module
          </a>
          <a
            href="https://github.com/AlexNa-Holdings/heirsafe-ui"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
            title="heirsafe-ui on GitHub"
          >
            GitHub: heirsafe-ui
          </a>

          {/* Version chip */}
          <span
            className="ml-1 px-2 py-1 rounded border border-neutral-800 bg-neutral-900/60 text-xs text-neutral-300"
            title="Application version"
          >
            v{APP_VERSION}
          </span>
        </nav>
      </div>
    </footer>
  );
}
