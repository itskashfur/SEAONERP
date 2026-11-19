# Role permission hotfix

## Fix
Inventory, Orders, Production, BOM and Warehouse screens load the product catalogue as supporting lookup data. The API previously required `products.read` for that lookup, but the built-in Inventory role only had `inventory.*`; this caused the whole Inventory page to display `You do not have permission` even though the role could view inventory.

`erp/permissions.py` now allows product-list reads when the user has the relevant module's view/action permission. Built-in role templates in `seed_seaon.py` also include `products.read` where appropriate for newly seeded databases.

## Apply
1. Replace the project files with this ZIP (or at minimum replace `Backend/erp/permissions.py` and `Backend/erp/management/commands/seed_seaon.py`).
2. Restart Django. No migration is required.
3. Log out and log back in, then open Inventory.

This does not grant inventory write permission. It only permits reading the product catalogue needed to render the module. Existing stock write permissions remain role-controlled.
