# XSS Security Report

## Status: HIGH (Fixed to PASS)

## Findings

In `js/app.js` at line 648 within `renderTaskHub()`:
The user-controlled student name `this.currentStudent` (loaded from `localStorage.getItem('rml_student_name')` or user input in the welcome/settings screen) was interpolated directly into `main.innerHTML` without escaping or sanitization:

```javascript
// Vulnerable snippet in js/app.js:
<div class="badge-name">${this.currentStudent} ✏️</div>
```

If an attacker stored malicious HTML/JavaScript (e.g. via console or a malicious payload entered in the name input field such as `<img src=x onerror=alert(1)>`), navigating to the Hub screen parsed this string as raw DOM, executing the script.

## What's at risk

An attacker could execute arbitrary JavaScript in the context of the student's browser session, corrupting local progress logs in `localStorage`, manipulating UI state, or executing cross-site actions.

## What's already secure

1. In `js/vocab-support.js`: All dynamic text fields and dictionary items are strictly escaped using `escapeHtml()`.
2. In `js/log-engine.js`: All student logs, session IDs, and student names are escaped using `escapeHtml()`.
3. In `js/task-engine.js`: Math inputs are parsed via `parseFloat(...)` ensuring only numeric values are stored.
4. Header badges in `app.js` line 25 and 95 use `badge.innerText = this.currentStudent` which is inherently safe against XSS.

## Recommendations

1. Provide an `escapeHtml` helper in `js/app.js` and wrap `${this.escapeHtml(this.currentStudent)}` at line 648.
2. Verify with test inputs containing special characters `<, >, &, ", '`.
