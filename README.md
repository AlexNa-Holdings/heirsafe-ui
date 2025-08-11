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
