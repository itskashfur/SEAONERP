# SEAON: Email and WhatsApp credentials setup

This guide shows where to configure credentials. **Do not paste real API keys, SMTP passwords, or WhatsApp tokens into Python/JavaScript files or share them in chat.** Keep them in `Backend/.env`, which is read by `config/settings.py`. The `.env.example` file contains placeholders only.

## 1. Configure email

1. Open the extracted project folder, then `SEAON_FV1/Backend/`.
2. Copy `.env.example` and name the copy `.env` (Windows may hide file extensions; ensure it is not `.env.txt`).
3. Fill in the email provider values:
   - `EMAIL_HOST`: SMTP hostname from your email provider.
   - `EMAIL_PORT`: usually 587 for STARTTLS or 465 for SSL.
   - `EMAIL_HOST_USER`: authenticated sender mailbox.
   - `EMAIL_HOST_PASSWORD`: provider SMTP password or app password.
   - `DEFAULT_FROM_EMAIL`: sender address permitted by that provider.
4. Save and restart the SEAON backend.

### Gmail SMTP example

Use `smtp.gmail.com`, port `587`, `EMAIL_USE_TLS=true`, and `EMAIL_USE_SSL=false`. For Gmail, enable 2-Step Verification and create an App Password from your Google Account. Use that App Password as `EMAIL_HOST_PASSWORD`, not your normal Gmail password. If changing the sender later, update `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `DEFAULT_FROM_EMAIL` together, and confirm the new mailbox/alias is authorized.

For another SMTP provider, replace host, port, TLS/SSL and credentials with the provider's SMTP documentation.

## 2. API-based email providers

An API key is **not interchangeable with SMTP credentials**. It works only with the provider's documented API (for example, a transactional email service). An MCP server key may authorize an MCP tool and may not be an email-send credential at all.

For an API provider:
- Store its key in a backend-only environment variable such as `EMAIL_PROVIDER_API_KEY=...` in `.env`.
- Implement the provider's documented HTTPS API in Django or its official SDK.
- Never put the key in frontend HTML/JS, never return it from an API endpoint, and do not add it to source control.
- Keep the API key's scope limited to sending email and rotate it if exposed.

This FV3 package is configured for Django SMTP settings. An arbitrary API/MCP key cannot be activated merely by entering it into the SMTP password field. The provider name/API docs are needed to implement its API correctly.

## 3. Configure WhatsApp

For WhatsApp business notifications, a common supported path is Meta's WhatsApp Business Platform Cloud API. You need a Meta developer app, a WhatsApp Business Account (WABA), a registered business phone number, a phone-number ID, and an access token with the required WhatsApp permissions. Template messages may be required for business-initiated messages outside the customer-service window.

Put values in `Backend/.env`:
- `WHATSAPP_ACCESS_TOKEN`: server-side access token (prefer a properly managed long-lived/permanent token).
- `WHATSAPP_PHONE_NUMBER_ID`: the sender phone-number ID from Meta.
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: WABA ID.
- `WHATSAPP_API_VERSION`: currently supported Graph API version from Meta's docs.
- `WHATSAPP_RECIPIENT`: recipient in international format, such as `+91...`.
- `WHATSAPP_ENABLED=true` only after backend WhatsApp sending code is implemented and tested.

The environment variables are preparation/configuration only. This FV3 package does **not** claim WhatsApp delivery is implemented; the backend needs an integration that calls Meta's Cloud API, handles approved templates, errors, and delivery statuses. Never expose the token to the browser.

## 4. Verify safely

- Start with a test recipient you control.
- Keep `.env` out of Git and ZIP sharing.
- Do not include real secrets in screenshots or logs.
- If a secret has been posted or shared, revoke/rotate it.
- For production, use a managed secret store and a production web server; do not rely on Django's development server.
