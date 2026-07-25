# Brand Asset Reference

This document records the purpose of the brand assets used by the application and the internal-only brand package files kept in the repository.

## Asset Groups

- `src/lib/pdf/assets/`
  Contains the server-only font and logo files used by PDF rendering.
  `DAGGERSQUARE.otf` is the primary company-name font.
  `louis-george-cafe.regular.ttf` is the secondary tagline font.
  `logo_h.png` is the horizontal logo variant embedded into generated PDFs.

- `docs/assets/internal/brand-package/wordmarks/`
  Contains internal wordmark-only brand assets that are not used by the runtime application.

- `public/icon/`
  Contains only the icon assets used by runtime metadata.
  `icon_color.svg` is the light-scheme app icon.
  `icon_white.png` is the dark-scheme app icon.

- `docs/assets/internal/brand-package/`
  Contains internal combined icon and wordmark lockups that are not used by the runtime application.

- `docs/assets/internal/brand-package/icon/`
  Contains internal icon variants that are not used by the runtime application.

- `docs/assets/internal/mockups/`
  Contains brand-display mockups for internal reference only.
  These are not runtime application assets and should not be used as product content without explicit approval.

- `public/favicon/`
  Contains website and app favicon assets.

## Supporting Files

- `docs/assets/internal/invoice.jpg`
  Internal project invoice reference.

## Format Notes

- `.svg`
  Vector asset format with broad platform support.

- `.pdf`
  Document format with broad device support.

- `.png`
  Raster asset format without background.
