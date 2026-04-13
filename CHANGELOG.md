# Changelog

## [0.4.0] - 2026-04-13

### Added

- **Interactive CLI Shell** - Replaced linear 14-step installer with persistent interactive menu
  - 10-option main menu: Setup, Dashboard, Projects, API Keys, Sessions, Quality, Knowledge, Settings, Live Monitor, Exit
  - Graceful error handling - CLI never crashes on missing dependencies
  - Full screen redraw on menu return for clean navigation
  
- **Clawd-style Mascot** - Added animated corn mascot inspired by Claude Code's Clawd character
  - Block-character mascot using Claude's orange palette `rgb(215,119,87)`
  - Two poses: `default` (arms at sides) and `happy` (arms up, shown on startup)
  - Mascot renders alongside app info in CondensedLogo layout

- **Claude Code-style Spinner** - Updated loading animations
  - Ping-pong symbol sequence: `· ✢ * ✶ ✻ ✽` (forward then reverse)
  - 50ms frame rate with Claude orange color
  - Context-aware thinking messages

- **API Keys CRUD** - Full interactive API key management
  - Create keys via POST to API with instant MCP propagation
  - Delete keys with immediate revocation
  - View/Edit Voyage AI key (OPENAI_API_KEY) directly from CLI
  - Works offline: env config editing always available, DB operations gracefully degrade
  - Real-time environment config display with masked key preview

- **Dashboard Data Screens** - Seven new data navigation screens
  - Dashboard overview with token savings, quality scores, knowledge stats
  - Projects, Sessions, Quality Reports, Knowledge Base viewers
  - Settings screen with system info, service health, environment variables

### Fixed

- **start.cmd instant crash** - Script no longer crashes when Docker is not installed
  - Added Docker availability check with automatic Node.js fallback
  - Default action (double-click) now launches interactive CLI instead of Docker
  - Added `pause` after every exit path so CMD window never closes silently
  - Added `chcp 65001` for UTF-8 support in Node.js output

- **Garbled text in CMD** - Fixed Unicode/emoji rendering issues
  - Replaced all emoji in menu items with CMD-safe colored ASCII symbols
  - Replaced em-dashes with hyphens in batch file text
  - Rewrote start.cmd using pure ASCII characters only
  - start.sh updated with matching Docker check and Node.js fallback

- **Menu navigation** - Fixed "Back" not returning to proper main menu
  - Main menu loop now clears screen and redraws banner on every iteration
  - System status info refreshes on each menu display

### Changed

- Banner layout: Mascot + app info side-by-side (CondensedLogo style) replaces large ASCII art block
- Spinner color: magenta -> Claude orange `rgb(215,119,87)`
- Spinner speed: 80ms -> 50ms
- start.cmd: Added `local`, `cli`, `status` subcommands
- Version bumped to 0.4.0 across all packages

## [0.3.0] - 2026-04-08

- Initial release
- MCP server with 20 tools
- Dashboard web UI
- API server with SQLite
- Docker Compose infrastructure
- Basic CLI installer (linear flow)
