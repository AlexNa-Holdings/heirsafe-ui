
# HeirSafe UI

A minimal, professional web UI for the **HeirSafe** Safe module.

- 🧩 **HeirSafe Module**: lets each Safe owner set a **beneficiary** and an **activation time**. After that time, the beneficiary can **claim** and replace that owner’s address. No funds move; only the owner address changes.
- 🔗 Module repo: https://github.com/AlexNa-Holdings/heirsafe-module  
- 🔗 UI repo: https://github.com/AlexNa-Holdings/heirsafe-ui

---

## Features

- **Install / Enable Module**
  - Predicts the module address from factory + salt
  - Checks deployment & enablement
  - If Safe threshold is **1** and you’re an owner, prepares and sends the **Enable Module** tx directly
  - Otherwise shows clear, copy-ready steps and an “Open Safe UI” shortcut
- **Owners & Heirs (inline)**
  - Per owner: **set beneficiary + activation**, **prolong**, **remove**
  - Local datetime picker → stored on-chain as **UTC seconds**
  - Live **countdown** (Local + UTC + “ready in / since …”)
  - If your connected address is a configured beneficiary and time has passed, you’ll see **Claim**
- **Nice UX**
  - Short, copyable addresses (`0x1234…abcd`) with tooltip and non-reflow “Copied” bubble
  - Calm **Status** bar (info/warn/error/success)
  - Remembers your last Safe (`localStorage`)
  - Collapsible “What is the HeirSafe module?” intro (remembers state)
  - Tasteful animated background/logo; respects `prefers-reduced-motion`
  - Tailwind CSS styling

---

## Quick Start

```bash
# clone
git clone https://github.com/AlexNa-Holdings/heirsafe-ui.git
cd heirsafe-ui

# install
pnpm install        # or: yarn install / npm install

# configure environment
cp .env.example .env.local
# edit .env.local (see below)

# run dev
pnpm dev            # or: yarn dev / npm run dev
# open http://localhost:5173

# build / preview
pnpm build
pnpm preview
````

---

## Configuration

Create `.env.local`:

```ini
# Optional: pre-fill the Safe address input
VITE_DEFAULT_SAFE=0xYourSafeAddress

# Required: 32-byte salt to deterministically predict the module address
# Must be 0x + 64 hex characters
VITE_INSTALL_SALT=0x0000000000000000000000000000000000000000000000000000000000000000
```

> The factory address per chain is configured in code at `src/config/chains.ts`.

---

## How It Works (high level)

* **Predict**: compute the deterministic module address from `factory + safe + salt`.
* **Check**: read code at the predicted address; inspect Safe’s enabled modules.
* **Enable**:

  * If `threshold === 1` and you are an owner, the app builds and sends the enable tx to your wallet.
  * Otherwise, it shows Safe UI instructions and a shortcut button.
* **Owners table**:

  * Reads Safe owners.
  * Reads `heirConfigs(owner)` (beneficiary, activationTime) from the module.
  * Inline actions sign with your **EOA** (outside Safe App embedding).

---

## Screenshots

Add images under `docs/images/` and link them here:

```
![Owners & heirs](docs/images/owners-table.png)
![Enable module](docs/images/enable-module.png)
```

---

## Development Notes

* **Tailwind CSS (PostCSS)**
  If you see: “It looks like you're trying to use `tailwindcss` directly as a PostCSS plugin…”, install and configure:

  ```bash
  pnpm add -D @tailwindcss/postcss
  ```

  And ensure your PostCSS config uses `@tailwindcss/postcss`.

* **Accessibility**
  Background animations respect `prefers-reduced-motion`.

---

## Troubleshooting

* **“Factory not configured for chain X”**
  Add/update the factory address in `src/config/chains.ts`.

* **“Factory not deployed on this network”**
  The configured factory address has no bytecode on the active chain—fix the address or switch networks.

* **Enable flow didn’t auto-send**
  Auto-send only when **threshold = 1** and your connected wallet is a Safe owner; otherwise follow the provided Safe UI steps.

---

## Contributing

PRs welcome! Please keep changes focused and consistent with the existing style (TypeScript, Tailwind). If you add networks, update `src/config/chains.ts` carefully.

---

## License

**GNU General Public License v3.0** — see [LICENSE](./LICENSE).

---

## Author

**Written by [Alex Na](https://x.com/AlexNa)**

* Module: [https://github.com/AlexNa-Holdings/heirsafe-module](https://github.com/AlexNa-Holdings/heirsafe-module)
* UI: [https://github.com/AlexNa-Holdings/heirsafe-ui](https://github.com/AlexNa-Holdings/heirsafe-ui)

*(Optional) Built with assistance from GPT-5 Thinking.*

```
::contentReference[oaicite:0]{index=0}
