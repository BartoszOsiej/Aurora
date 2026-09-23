# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-09-23

### Added
- **.aurora format v2** — full-system snapshots: filesystem + desktop settings,
  SHA-256 integrity checksum (WebCrypto), canonical-JSON payload
- checksum verification on import with human-readable rejection reasons
- v1 snapshot files remain importable (settings fall back to defaults)
- kernel bridge: restored snapshots re-apply theme/wallpaper immediately
- 8 new tests (roundtrip, tamper detection, v1 compat, canonical JSON)

### Changed
- package version bumped to 1.1.0 (npm + GHCR publishing pick it up)

## [1.0.0] - 2025-08-01


### Added
- Full project implementation
- CI/CD pipeline with GitHub Actions
- Docker support
- CodeQL security analysis
- OpenSSF Scorecard
