# SEAON ERP update notes

## Changes included
- Reports search toolbar removed.
- Order actions use a dropdown; order status transition now supports Delivered after Dispatched.
- Returns action dropdown presents Return Created, Return Accepted, Mark Packed, Dispatched, Delivered and Return Completed.
- Return stock is posted only on Return Completed (`closed`) and remains protected by `return_stock_added` to prevent duplicate stock posting.
- Physical quantity/measurement DecimalFields use four decimal places across product thickness, inventory, stock movements, orders, production, BOM, batches, warehouse transactions and returns.
- Negative numeric input is blocked in the main application UI.
- Desktop sidebar has its own SEAON brand; mobile retains centered topbar brand and single left menu toggle. Mobile sidebar uses a light theme.
- Change Password button removed from the right-side desktop profile area; sidebar password action remains.
- Existing Returns records in the bundled SQLite database were cleared as explicitly requested. Other database tables were not intentionally cleared.
- Uploaded Excel stock workbooks are included in `Backend/import_data/` for product/stock import.

## Important deployment step
Run database migrations before starting the app:
`cd Backend && python manage.py migrate`

## Excel import note
The workbooks are included, but their columns and category structures differ. They have not been automatically imported into product/stock tables because doing so without a reviewed product-matching rule could create duplicate or incorrectly dimensioned inventory. Review/import them through the ERP's import workflow before using as opening stock.

## Validation performed
- Python source syntax compilation: passed.
- `node --check` on `Backend/public/JS/app.js`: passed.
- ZIP archive integrity: checked after packaging.
- Django runtime/database migration execution and browser end-to-end testing: not performed in this environment.
