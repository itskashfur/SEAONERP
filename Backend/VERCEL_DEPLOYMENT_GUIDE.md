# SEAON ERP - Vercel deployment fix

## Why the page was unstyled

The deployed request for `/app/CSS/style.css` returned HTTP 400. The
previous Django settings only allowed `127.0.0.1` and `localhost`, so
Django rejected the Vercel hostname (`DisallowedHost`). The previous
`app.py` was also a local startup script and did not expose a WSGI callable
for Vercel.

## Files changed

- `app.py`: now exposes Django's WSGI callable as `app`.
- `run_local.py`: preserves the old one-click local startup script.
- `config/settings.py`: reads `SECRET_KEY`, `DEBUG`, and `ALLOWED_HOSTS`
  from environment variables; allows `.vercel.app` by default.
- `vercel.json`: routes requests to the Django Python function.
- Existing `/app/...` URL paths and frontend files are preserved.

## Vercel setup

1. Push the contents of this `Backend` folder to your GitHub repository,
   or configure Vercel Root Directory to `Backend` if the repository root
   contains the outer project folder.
2. In Vercel Project -> Settings -> General, set Root Directory to
   `Backend` (only if `Backend` is a subfolder in the Git repository).
3. Keep Framework Preset as Other unless Vercel explicitly detects Django.
4. The `vercel.json` file must be in the selected Root Directory, beside
   `app.py`, `manage.py`, and `requirements.txt`.
5. Add these Environment Variables in Vercel:
   - `SECRET_KEY`: a new, long, random Django secret (do not reuse the
 development secret).
   - `DEBUG`: `False`
   - `ALLOWED_HOSTS`: `127.0.0.1,localhost,.vercel.app`
   - `EMAIL_HOST`: `smtp.gmail.com`
   - `EMAIL_PORT`: `587`
   - `EMAIL_USE_TLS`: `True`
   - `EMAIL_HOST_USER`: your Gmail sender address
   - `EMAIL_HOST_PASSWORD`: a newly generated Google App Password
   - `DEFAULT_FROM_EMAIL`: your Gmail sender address
6. Redeploy using Deployments -> latest deployment -> Redeploy, or push
   the changed files to GitHub and let Vercel deploy the commit.

## Verify

After deployment, open these URLs in a browser:
- `https://YOUR-DOMAIN.vercel.app/health/`
- `https://YOUR-DOMAIN.vercel.app/app/CSS/style.css`
- `https://YOUR-DOMAIN.vercel.app/app/JS/api.js`

Expected:
- `/health/` returns JSON with `ok: true`.
- CSS URL returns CSS text with HTTP 200 and `Content-Type: text/css`.
- JS URL returns JavaScript text with HTTP 200.

Then hard refresh the ERP page with Ctrl+Shift+R.

## Important production limitation

This fixes the current WSGI/host/static-file routing issue, but the project
still uses SQLite (`seaon.db`). Vercel serverless filesystems are not a
durable shared database. Do not use this setup for real production ERP
records until the database is migrated to managed PostgreSQL (or the
backend is hosted on a persistent Django service). Also do not run the
sample-data import automatically on each request.

## Local startup

The previous one-click local startup command is now:
python run_local.py
