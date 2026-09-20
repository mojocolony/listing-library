# Listing Library

A personal library for collecting, organizing, and browsing real estate listings.

## v0.1.1

The first prototype uses **2 OAK KNOLL Drive** as the built-in reference property. It includes a property grid, favourites, search, photo gallery, floorplans, listing files, video link, and notes UI.

### Expected folder structure

```text
Property Library/
  Property Name/
    Photos/
    Floorplans/
    Listing/
    Video/
```

On supported desktop browsers, **Open Library** lets you choose a local `Property Library` folder and scans each property folder. The original files are not changed.

## Deploy to GitHub Pages

1. Create a repository named `listing-library`.
2. Upload everything in this folder to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then save.

No build process or dependencies are required.


## v0.1.1
- Added click-to-enlarge viewer for photos and floorplans.
- Added previous/next controls, keyboard arrow navigation, Escape-to-close, and item count.
