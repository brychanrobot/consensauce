# 🥫 Consensauce — Real-Time Collaborative Taste Tests & Tier Lists

**Consensauce** is a collaborative, real-time tier list platform specifically engineered for taste tests (Trader Joe's snacks, craft beers, dips, hot sauces, coffee beans, and takeout showdowns).

Most online tier list makers are clunky, desktop-only, and lack real-time synchronization. Consensauce provides an effortless, mobile-friendly Progressive Web App (PWA) designed for tasting nights with friends or partners.

---

## ✨ Features

- 📸 **Live Synchronized Item Queue**: Snap photos with your phone camera or upload images. Convex storage uploads and broadcasts items in real time over WebSockets to every connected taster.
- 📱 **Private Independent Ranking**: Rate items privately on your own screen so you don't bias each other's opinions.
- 📲 **Progressive Web App (PWA)**: Installable directly to mobile home screen with offline asset caching and full-screen experience.
- 🎯 **Dual Input Modes**: Tactile HTML5 drag-and-drop row reordering plus quick one-tap tier chips (`[S] [A] [B] [C] [D] [F]`) optimized for mobile lounging.
- 🌶️ **Spiciest Debate**: Automated superlatives engine calculates and highlights the item with the highest tier variance between tasters.
- 🤝 **Mind Meld**: Surfaces unanimous agreement when everyone picks the exact same tier.
- 👥 **Compare Tasters**: Switch tabs in the revealed consensus view to inspect each participant's individual completed board side by side.
- 🔑 **Guest or Account Auth**: Play instantly with guest nickname sessions or log in with Clerk for cross-device persistence.

---

## 🛠️ Tech Stack

- **Framework**: [SvelteKit 3](https://svelte.dev) with [Svelte 5 Runes](https://svelte.dev/docs/svelte/what-are-runes)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com) with `@tailwindcss/vite`
- **Backend & Database**: [Convex](https://convex.dev) reactive database, functions, and file storage
- **Authentication**: [Clerk](https://clerk.com) via `svelte-clerk`
- **Routing & Local Dev**: [Portless](https://github.com/vercel-labs/portless) (`https://consensauce.localhost`)
- **Code Quality**: [Biome 2.5](https://biomejs.dev)
- **Testing**: [Vitest](https://vitest.dev) (unit & browser) and [Playwright](https://playwright.dev) (end-to-end)
- **Version Control**: [Jujutsu (`jj`)](https://github.com/martinvonz/jj)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [pnpm](https://pnpm.io/)
- [Portless](https://github.com/vercel-labs/portless) for local `.localhost` domain routing

### Setup

1. **Clone and install dependencies**:
   ```bash
   pnpm install
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env` and fill in your Convex and Clerk credentials:
   ```env
   PUBLIC_CONVEX_URL="https://your-deployment.convex.cloud"
   PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
   CLERK_SECRET_KEY="sk_test_..."
   ```

3. **Start Development Server**:
   ```bash
   pnpm dev
   ```
   Open [https://consensauce.localhost](https://consensauce.localhost) in your browser.

---

## 🧪 Testing & Verification

```bash
# Typecheck & lint
pnpm run check

# Unit tests (Server & browser components)
pnpm run test:unit

# End-to-end multi-user walkthrough
pnpm run test:e2e
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
