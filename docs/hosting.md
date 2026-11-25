# Hosting your own copy

`bun run build` produces static files with relative paths, so `dist/` works under any path on any static host. `server.js` serves it with Bun (port from `PORT`, folder from `DIST`, health check at `/health`); `railway.json` is a ready configuration for [Railway](https://railway.com).

The footer links are set at build time through environment variables. An empty one hides its link:

| Variable | Link | Default |
|---|---|---|
| `VITE_HOME_URL` | "Slidecko" | this repository |
| `VITE_LEGAL_URL` | legal notice | none |
| `VITE_PRIVACY_URL` | privacy policy | none |
| `VITE_SUPPORT_URL` | donation link, e.g. a Stripe Payment Link | none |

```bash
VITE_LEGAL_URL=https://example.com/imprint VITE_PRIVACY_URL=https://example.com/privacy bun run build
```

If you run Slidecko publicly, you are responsible for your own legal notice and privacy policy; [privacy.md](privacy.md) lists what the app stores.
