# Listing Library v0.2.1 update

Changed/new files only. Upload these to the repository root, preserving the `icons` folder:

- `index.html`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icons/houses.svg`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/maskable-512.png`
- `icons/apple-touch-icon.png`

`styles.css` is unchanged from v0.2.0.

## What changed

- Listing Library is now installable as a standalone PWA in Chrome.
- Added a web-app manifest, local Houses icon assets, and a lightweight service worker.
- The service worker is network-first so normal GitHub Pages updates are not hidden behind an aggressive offline cache.
- Header icon and favicon now use the local Lucide `houses` asset.

After deploying, reload the site once so Chrome sees the new manifest/service worker, then use Chrome's install option for the site.
