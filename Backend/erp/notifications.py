"""Order notifications through SMTP email and the WhatsApp Cloud API.

Credentials are read from environment variables; never commit real credentials.
Notifications are best-effort: an external provider outage does not undo an order.
"""
import json
import os
import re
import urllib.error
import urllib.request
from django.conf import settings
from django.core.mail import EmailMessage


def _send_vendor_email(order):
    """Email the customer and CC the additional addresses supplied on the order."""
    recipients = getattr(order, "vendor_emails", None) or []
    if not recipients and order.vendor_email:
        recipients = [order.vendor_email]

    def clean(values):
        return list(dict.fromkeys(
            str(value).strip() for value in values
            if str(value or "").strip()
        ))

    cc_emails = clean(recipients)
    customer_email = (order.customer_email or "").strip()
    # When no customer address is supplied, send the message to the configured
    # company mailbox so CC recipients can still receive the order notification.
    to_emails = [customer_email] if customer_email else [settings.DEFAULT_FROM_EMAIL]
    cc_emails = [
        address for address in cc_emails
        if address.lower() not in {item.lower() for item in to_emails}
    ]
    if not customer_email and not cc_emails:
        return {"status": "skipped", "detail": "No customer or CC email recipients supplied."}
    if not settings.EMAIL_HOST or not settings.DEFAULT_FROM_EMAIL:
        return {"status": "not_configured", "detail": "Configure SMTP settings in Backend/.env."}

    subject = f"New SEAON order: {order.order_number}"
    message = (
        "Hello,\\n\\nA new order has been created in SEAON ERP.\\n\\n"
        f"Order number: {order.order_number}\\n"
        f"Customer: {order.customer_name}\\n"
        f"Product: {order.product.name}\\n"
        f"SKU: {order.product.sku}\\n"
        f"Quantity: {order.quantity} {order.product.unit}\\n"
        f"Order type: {order.order_type}\\n"
        f"Status: {order.status}\\n"
        f"Created at: {order.created_at:%Y-%m-%d %H:%M}\\n"
        f"Notes: {order.notes or 'None'}\\n\\n"
        "Please confirm availability and the expected delivery date.\\n\\n"
        "Regards,\\nSEAON ERP"
    )
    try:
        email = EmailMessage(
            subject=subject,
            body=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=to_emails,
            cc=cc_emails,
        )
        sent = email.send(fail_silently=False)
        return {
            "status": "sent" if sent else "failed",
            "detail": "Email accepted by SMTP." if sent else "SMTP did not send the email.",
            "recipient_count": len(to_emails) + len(cc_emails),
        }
    except Exception as exc:
        return {"status": "failed", "detail": f"Email provider error: {exc.__class__.__name__}. Check SMTP configuration."}


def _send_vendor_whatsapp(order):
    recipient = re.sub(r"[^0-9]", "", order.vendor_whatsapp or "")
    if not recipient:
        return {"status": "skipped", "detail": "No vendor WhatsApp number supplied."}
    token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    api_version = os.getenv("WHATSAPP_API_VERSION", "v23.0").strip()
    if not token or not phone_number_id:
        return {"status": "not_configured", "detail": "Configure WhatsApp Cloud API credentials in .env."}
    text = (
        f"SEAON ERP: New order {order.order_number}\nProduct: {order.product.name} ({order.product.sku})\n"
        f"Quantity: {order.quantity} {order.product.unit}\nType: {order.order_type}\n"
        f"Status: {order.status}\nNotes: {order.notes or 'None'}"
    )
    payload = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": recipient,
               "type": "text", "text": {"preview_url": False, "body": text}}
    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST",
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
            if response.status in (200, 201) and data.get("messages"):
                return {"status": "sent", "detail": "WhatsApp API accepted the message."}
            return {"status": "failed", "detail": "WhatsApp API did not confirm delivery."}
    except urllib.error.HTTPError as exc:
        # Do not expose provider response bodies, which can contain sensitive details.
        return {"status": "failed", "detail": f"WhatsApp API returned HTTP {exc.code}. Check recipient, token, permissions and message policy."}
    except Exception as exc:
        return {"status": "failed", "detail": f"WhatsApp provider error: {exc.__class__.__name__}. Check network and configuration."}


def notify_vendor_for_order(order):
    """Attempt both channels and return a safe status summary."""
    return {"email": _send_vendor_email(order), "whatsapp": _send_vendor_whatsapp(order)}


def enqueue_order_notifications(order_id):
    """Run external notifications after the order transaction commits.

    A daemon worker keeps SMTP/WhatsApp network latency out of the create-order
    HTTP request. Connections are closed in the worker to remain safe with SQLite.
    """
    import threading
    from django.db import close_old_connections
    from .models import Order

    def worker():
        close_old_connections()
        try:
            order = Order.objects.select_related("product").get(pk=order_id)
            notify_vendor_for_order(order)
        except Exception:
            # External notification failure must never affect the saved order.
            pass
        finally:
            close_old_connections()

    threading.Thread(
        target=worker,
        name=f"order-notifications-{order_id}",
        daemon=True,
    ).start()
