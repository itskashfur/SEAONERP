# SEAON V7 — Role permission dropdown readability fix

Updated only `Backend/public/CSS/style.css`.

## What changed
- Permission categories now stack as full-width expandable dropdown rows.
- Expanded categories show readable, horizontally aligned checkbox rows.
- Checkbox dimensions and label layout are explicitly constrained to prevent inherited global styles from shrinking or rotating the text.
- Long permission labels wrap horizontally without horizontal scrolling.
- The same styling applies to Create Role and Edit Role.
- Existing `admin.js` and its backend API integration were preserved.

## Validation
- `Backend/public/JS/admin.js`: Node syntax check passed (unchanged).
- ZIP integrity: checked after packaging.
- Live browser/Django test: not run in this environment.
