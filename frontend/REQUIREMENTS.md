# Frontend Requirements

No separate library requirements file is needed for this frontend.

Frontend package dependencies are already defined in:

- `package.json`
- `package-lock.json`

## Runtime

- Node.js 22 or newer
- npm 10 or newer

## Environment

Optional backend URL:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

If `NEXT_PUBLIC_API_BASE_URL` is empty, the app uses the built-in demo data fallback.

## Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Generated folders such as `node_modules/`, `.next/`, logs, and local env files are ignored by Git.
