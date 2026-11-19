"""
Vercel serverless entry point for SEAON ERP.

Vercel forwards HTTP requests to this Django WSGI application.
Do not run migrations, seed data, import sample data, or runserver here.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
app = application
