# Orders module fixes

- Vendor email addresses are optional; orders can be created without them.
- Customer email and sender email are optional CC recipients for order email notifications.
- Vendor addresses remain the TO recipients. Duplicate addresses are not added again as CC.
- Email and WhatsApp notifications are queued after the order transaction commits and run in a background thread, so provider/network latency does not block the order-create response.
- Order-created Alerts and Audit Log descriptions include vendor, customer, and sender email addresses. Missing values are recorded as `Not Provided`.
- External notification failures do not roll back a successfully created order.

## Configuration
Configure Gmail SMTP credentials only in `Backend/.env` using the existing `Backend/ORDER_EMAIL_SETUP.md` instructions. Do not place credentials in frontend files or commit real credentials.
