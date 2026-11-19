# SEAON ERP V5 — targeted fixes

This package is based on the supplied V5.zip. Changes are limited to the reported workflows.

## Changes

- Inventory stock adjustment now uses Decimal end-to-end (Django view and stock service), avoiding Decimal/float arithmetic errors.
- Inventory Adjust opens a custom modal with a live quantity preview and retains the existing `/inventory/<product_id>/stock/` API.
- Inventory Edit now persists the edited quantity to the Inventory row and writes a StockMovement ledger entry when the quantity changes.
- Inventory Delete is implemented as a safe archive (`is_active=False`) so transaction history is retained. Archived products disappear from active product and inventory lists. Products still referenced by orders, production or BOM are protected from deletion.
- Orders form remains inline on the Orders page. Finished and Semi-finished are separate product classifications; Manufactured and Readymade/From Stock remain the backend-supported fulfilment values.
- Product selection is filtered by Finished/Semi-finished classification.
- BOM Edit/Delete handlers now bind to all matching buttons (`querySelectorAll`); previously `$()` returned a single element and `.forEach()` could not attach the handlers.
- BOM serializer validates positive quantity per unit and prevents a product from being its own BOM component.
- Real credentials were removed from `.env.example` and Django settings defaults. Configure secrets in a local `Backend/.env` file.

## Run

From the Backend directory:

```powershell
python manage.py runserver
```

No model schema changes were made, so these fixes do not require a new migration.

## Important behaviour

A Manufactured order still requires a configured BOM. If the selected product has no BOM, configure its raw/semi-finished materials in BOM / Materials, or choose Readymade / From Stock when fulfilling from existing stock.

Delete archives products instead of hard-deleting them. This preserves stock movement and audit history. A product referenced by an order, production job or BOM must first be unlinked from those records.

## Validation performed

- JavaScript syntax check: passed (`node --check`).
- Python syntax compilation: passed (`compileall`).
- Full Django runtime/API tests were not run in this environment because Django is not installed in the available Python runtime. Test the workflows against your local Django environment after extracting the package.
