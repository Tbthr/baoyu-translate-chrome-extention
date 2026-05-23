# Research: Baoyu Translate Chrome Extension

**Branch**: `001-baoyu-translate-ext` | **Date**: 2026-05-24

## R-001: Chrome Extension MV3 Service Worker Lifecycle

**Decision**: Use long-lived port connections (`chrome.runtime.onConnect`) from content script to keep Service Worker alive during translation. Persist translation state to `chrome.storage.local` every batch for crash recovery.

**Rationale**: MV3 Service Workers have a ~5 minute hard timeout. During active translation, the content script maintains a port connection which keeps the SW alive. Between API calls, we call a Chrome API every ~25 seconds as a fallback. State persistence enables resume after unexpected termination.

**Alternatives considered**:
- `chrome.alarms` API: Only fires at minimum 1-minute intervals, too coarse for progress tracking
- Periodic `chrome.runtime.getPlatformInfo()`: Hackish, less reliable than port-based keep-alive
- Offscreen documents: Overkill for this use case, adds complexity

## R-002: Content Extraction Strategy

**Decision**: Use Mozilla's Readability.js library for article extraction. Clone the document DOM, pass to Readability parser, extract paragraphs while preserving source DOM positions for translation injection.

**Rationale**: Readability.js is the industry standard (powers Firefox Reader View). It reliably extracts article content while removing navigation, ads, sidebars. We clone the DOM to avoid mutating the page during analysis, then map extracted paragraphs back to original DOM nodes for translation injection.

**Alternatives considered**:
- Custom DOM traversal: Fragile, breaks on varied page layouts
- Defuddle: Newer but less battle-tested for this use case
- Chrome's built-in Reader Mode API: No programmatic access for extensions

## R-003: Project Structure & Build System

**Decision**: TypeScript + Vite with manual Chrome Extension MV3 project structure. No framework for Popup UI — vanilla TypeScript + CSS matching the Anthropic-style design from `design-preview.html`.

**Rationale**: The Popup is a simple 320px-wide panel with segmented control, dropdown, and a few inputs. A framework (React/Vue) would add bundle size and complexity for minimal benefit. Vite provides fast builds and native TypeScript support. The `design-preview.html` already defines the exact CSS we need.

**Alternatives considered**:
- CRXJS Vite plugin: Adds abstraction layer, may conflict with custom content script needs
- Plasmo/Extension.js framework: Overkill for this scope, adds learning curve
- Webpack: Slower builds, more config than Vite

## R-004: API Communication Format

**Decision**: Use OpenAI-compatible Chat Completions API format (`POST /v1/chat/completions`) for all providers. For Anthropic, rely on user configuring an OpenAI-compatible proxy endpoint (or use Anthropic's own OpenAI-compatible endpoint if available).

**Rationale**: The spec explicitly states "AI Provider 使用 OpenAI 兼容的 Chat Completions API 格式". This simplifies the codebase to a single API adapter. Most AI providers now offer OpenAI-compatible endpoints. Anthropic has added OpenAI-compatible API support on their platform.

**Alternatives considered**:
- Multi-format adapter (OpenAI + Anthropic native): Adds complexity, spec explicitly requires OpenAI format
- Universal LLM SDK (LangChain etc.): Heavy dependency, unnecessary abstraction

## R-005: Translation Injection & Bilingual Display

**Decision**: Content script identifies text-containing DOM elements (p, h1-h6, li, blockquote, td, span in certain contexts). After translation, inject a new sibling element below each original with identical font/size/color styling plus a left gray border. Skip code blocks (`pre`, `code`) entirely.

**Rationale**: Directly injecting below original elements preserves page layout and makes bilingual reading natural. The gray left border (matching `design-preview.html` aesthetic) distinguishes translations without disrupting the reading flow.

**Alternatives considered**:
- Side-by-side layout: Breaks responsive designs, requires complex CSS overrides
- Tooltip/overlay: Poor readability for long translations, disrupts reading flow
- Replacing original text: Loses the ability to compare with source

## R-006: Translation Prompt Engineering

**Decision**: Three distinct system prompts for the three modes, each with structured output format. Shared context (glossary from analysis phase) injected into each batch translation request.

- **Quick mode**: Single-pass translation prompt, entire article as one request (or split at ~4000 words)
- **Normal mode**: Analysis prompt → extract domain/terms → translation prompt with analysis context
- **Refined mode**: Analysis → translation with context → review prompt → polish prompt

**Rationale**: The baoyu-translate skill's three-mode approach is proven. Structured prompts with explicit output format (JSON array of paragraph translations) make parsing reliable.

**Alternatives considered**:
- Streaming translations: Adds complexity, spec doesn't require real-time display
- Single prompt with mode parameter: Reduces prompt quality per mode
- External glossary service: Unnecessary, analysis phase handles terminology

## R-007: Storage & Caching Strategy

**Decision**: Use `chrome.storage.sync` for user settings (provider config, last mode). Use `chrome.storage.local` for translation cache (up to 20 entries, 24h TTL, keyed by page URL).

**Rationale**: `chrome.storage.sync` automatically syncs across devices via Chrome account (per spec FR-006). `chrome.storage.local` has higher size limits (10MB vs 100KB for sync) suitable for cached translations. Cache eviction by timestamp is simple and effective.

**Alternatives considered**:
- IndexedDB: More complex API, overkill for key-value cache
- `chrome.storage.session`: Cleared on browser close, not suitable for 24h cache
- `localStorage`: Not available to Service Workers

## R-008: Error Handling & Retry Strategy

**Decision**: Exponential backoff retry with mode-specific limits (Quick/Normal: 2 retries, Refined: 3 retries). On final failure, pause translation and inject an error banner on the page with action buttons (retry / switch mode / cancel).

**Rationale**: Network errors and API rate limits are transient — retries handle most failures. Mode-specific limits reflect the higher value of refined translations (more effort invested, worth more retries). User-facing error recovery gives control back to the user.

**Alternatives considered**:
- Silent retry without user feedback: Poor UX for long failures
- Automatic fallback to simpler mode: May produce unexpected quality drops
- Single retry count for all modes: Doesn't account for mode-specific effort investment
