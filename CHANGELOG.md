# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-05-05

### Added
- **Highlights Section**: Implemented the missing Highlights section on the About page with interactive cards for Admissions, Webinars, and Batches.
- **Premium UI Animations**: Added global hover interactions (`scale`, `-translate-y-1`, and deep drop shadows) to buttons, blog cards, and class overview cards.
- **Environment Documentation**: Added `.env.example` to track required environment variables like `GOOGLE_SCRIPT_URL`.
- **Custom Scrollbar & Smooth Scrolling**: Enhanced global CSS for better UX.

### Changed
- **Project Restructuring**: Flattened the directory structure. Moved all application code from the nested `elearning-copy` folder to the root project directory.
- **Project Name**: Renamed application to `cert-ed-academia` in `package.json`.
- **Contact Form UX**: Stacked Full Name and Phone Number fields vertically for better spacing. Restrained the country code dropdown width and removed flag emojis to preserve horizontal space.
- **Navbar UX**: Upgraded Navbar to use a modern frosted-glass (glassmorphism) background. Added active state hover effects and an animated slide-down transition for the mobile menu.
- **Blog Dates**: Updated static blog dates to recent dates (Jan-March 2026).

### Fixed
- **SEO Favicons**: Replaced unsupported WebP icon configuration with standard PNGs (`favicon_32.png`, `favicon_96.png`) to fix the Vercel logo appearing in Google Search.
- **Google Search Console**: Correctly placed the verification file in the `public` directory.

### Security & Performance
- **Asset Optimization**: Moved heavy Adobe Illustrator (`.ai`) and Vector (`.eps`) source files out of the `public` directory into a secure `design_assets` folder to prevent them from being publicly exposed and bloating the Vercel deployment size.
- **Dependency Cache**: Purged corrupted Next.js cache and `node_modules`.
