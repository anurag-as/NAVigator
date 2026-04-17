# NAVigator

A fully client-side static web app that parses your CAMS/KFintech Consolidated Account Statement (CAS) PDF and computes XIRR for each mutual fund portfolio, all in the browser. Nothing is uploaded to any server.

## Development

### Prerequisites

- Node.js 20+
- npm

### Install dependencies

```bash
npm install
```

### Start the dev server

```bash
npm run dev
```

Opens at `http://localhost:5173/navigator/`.

### Run tests

```bash
npm test
```

Runs all Vitest tests once (non-watch mode).

### Build for production

```bash
npm run build
```

Outputs a static site to `dist/`. The build runs `tsc` first to catch type errors, then Vite bundles the assets.

### Preview the production build

```bash
npm run preview
```

Serves the `dist/` folder locally to verify the production build before deploying.

### Lint

```bash
npm run lint
```

Runs ESLint over `src/` using the TypeScript-aware flat config.

### Format

```bash
npm run format
```

Formats all files with Prettier. To check formatting without writing:

```bash
npm run format -- --check
```
