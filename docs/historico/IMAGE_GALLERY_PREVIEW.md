# Image gallery review — 0.4.17 restoration checkpoint

Historical evidence only. Current installation and recovery follow
[DESKTOP_MACOS.md](../DESKTOP_MACOS.md); this checkpoint does not authorize
replacing files inside an installed application.

The 0.4.14 implementation from commit `97b8485` was restored on the official
0.4.17 base. Current local script item-orchestration and authorized Dracula
changes are preserved. This branch is a source checkpoint/contribution candidate,
not an official release. A Node 26 run passed gallery tests, script orchestration
integration, Claude fixture tests and TypeScript checks. Build passed.

The operational release guard lives in the consumer project, not in the Core.
It compares before/after plugin metadata and completed deliveries, inventories
portable sources, and checks exact remote commits. Runtime credentials and live
production media are not versioned. See consumer `contentflow/UPDATE_AND_RESTORE.md`.

## Historical validation and implementation provenance

## Universal Core component

`src/components/image-gallery.tsx` accepts StoredFile images. It provides a horizontal
thumbnail rail with scroll buttons and a large Radix dialog with previous/next
buttons, ArrowLeft/ArrowRight, position counter, Escape and focus restoration.
Read-only output galleries and human image selection share this component.
No plugin, provider, project ID, API, credentials or generation behavior is embedded.

Opening, closing, scrolling and navigating only change local React view state.
Optional `selectedIds` and `onToggle` connect explicit selection buttons to the
existing human draft. No automatic approval, publication, retry or cleanup occurs.
Non-image validation choices retain their previous rendering.

## Provenance and limits

Based on installed Core commit `bf3edb4` (0.4.14), not the older 0.3.2 working tree.
Restores functionality from `27f5aff` / `481183e` with an independent selection button
and horizontal rail. Existing local Dracula tokens are preserved on this branch.
Does not introduce a new official release, plugin version or domain contract.
Does not alter selection quantity validation or fix unrelated Method schemas.

## Validation

```sh
node node_modules/tsx/dist/cli.mjs --test src/components/image-gallery.test.tsx
npm run test:presentation
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Tests cover 30 images, horizontal controls, read-only/single-image behavior,
preserved selected IDs and no selection callback during initial render.
Native UI check: open preview, next (1→2), previous (2→1→30), close, focus restored.
Live production remained awaiting_human with 30 images and zero chosen images.
Selection and completion were deliberately not executed on the real production.

## Historical compatibility finding

Critical: build dependencies must match packaged runtime dependencies. An initial
build with router-core 1.171.27 failed against installed 1.171.15 (`_getRenderedMatches`
missing). It was rolled back immediately; rebuilding with 1.171.15,
react-router 1.170.18, react-start 1.168.34, React 19.2.8 and Vite 8.2.0 passed.
This dependency mismatch is preserved as evidence; it is not a procedure for
swapping bundle contents or changing installed runtime dependencies.
