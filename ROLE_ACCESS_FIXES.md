# SEAON ERP — Role and user access fixes

## What changed

- Main ERP and Admin pages now fetch the signed-in user's profile, role and permissions from `/api/auth/me/` on page load. The database is authoritative; stale browser `localStorage` role data is refreshed before navigation is built.
- User profiles are created safely when an older account does not yet have a `UserProfile` row.
- Admin user creation validates the selected role and stores it on `UserProfile`.
- Admin Users now shows a role dropdown on each account with a **Save Role** action, in addition to Activate/Deactivate.
- User role changes are persisted to the database and the user's outstanding refresh tokens are revoked so the account must establish a fresh session.
- Role creation and editing keep `RoleDefinition.permissions_json` and `PermissionRule` rows synchronized.
- Backend permission checks read the saved role definition and support the granular role permissions used by the UI for inventory, order and production write actions.
- Roles & Permissions now uses a fixed-column table for aligned role details, plus an Edit Permissions modal.

## Deployment

No model fields were added, so no new migration is required.

1. Back up your current database.
2. Replace the project files with this ZIP.
3. Restart Django and refresh the browser with Ctrl+Shift+R.
4. Sign in as a Super Admin or Admin, open Admin Panel → Users, choose a role from the dropdown and click Save Role.
5. The target user should sign out and sign back in. Their current role and permissions are also reloaded from `/api/auth/me/` whenever the main ERP or Admin page loads.

## Validation performed

- Python syntax compilation passed for the changed Django modules.
- JavaScript syntax checks passed for `app.js`, `admin.js`, and `api.js`.
- Full Django/database/browser integration testing was not possible in this build environment because Django is not installed here. Test role assignment and each role's API access against your local database before production deployment.

## Security note

Only a Super Admin can assign the `super-admin` role. Admins can assign all other roles that exist in Roles & Permissions. Users cannot assign themselves a higher role through the API.
