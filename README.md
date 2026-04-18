# research-hub

## Local setup

```bash
npm install
npm run setup-hooks   # one time — enables .githooks/pre-push
npm run dev           # local dev server
```

## Pre-push check

After `npm run setup-hooks`, every `git push` runs `npm run check` (which is
`vite build`) first. If the build fails, the push is blocked — this catches
JSX/syntax errors before CI and avoids a red deploy.

Bypass the check for a single push with:

```bash
git push --no-verify
```

The hook no-ops gracefully if `npm` isn't available on the machine.

## Scripts

| script          | what it does                          |
|-----------------|---------------------------------------|
| `npm run dev`   | Vite dev server                       |
| `npm run build` | production build into `dist/`         |
| `npm run check` | same as build — used by pre-push      |
| `npm run preview` | preview built site                  |
| `npm run deploy` | build + gh-pages deploy              |
