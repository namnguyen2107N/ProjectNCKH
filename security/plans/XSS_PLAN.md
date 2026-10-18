# XSS Fix Plan

## Changes

- `js/app.js` — Add `escapeHtml` utility method to `AppController` and sanitize `this.currentStudent` when rendering HTML in `renderTaskHub()`.

## New files

None.

## Verification goals

- [x] Setting `rml_student_name` to `<img src=x onerror="window._xss=1">` renders safely as escaped text and does NOT execute JavaScript.
- [x] All automated tests (`node test-track-flow.js`, `node test-splash-welcome.js`) pass without regressions.
