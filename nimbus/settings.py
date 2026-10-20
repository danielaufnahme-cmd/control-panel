"""
Django settings for the Control Panel demo (internal package name: nimbus).

This is a LOCAL-ONLY showcase project. The secret key below is a throwaway
placeholder; never deploy this configuration to the internet as-is.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "django-insecure-nimbus-local-demo-only-change-me"
DEBUG = True
# .ts.net lets you open it from your own devices via `tailscale serve` (tailnet only).
ALLOWED_HOSTS = ["127.0.0.1", "localhost", ".ts.net"]
CSRF_TRUSTED_ORIGINS = ["https://*.ts.net"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.humanize",
    "dashboard",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "nimbus.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                # Sidebar nav, notifications and current-user placeholder.
                "dashboard.context_processors.shell",
            ],
        },
    },
]

WSGI_APPLICATION = "nimbus.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Logo: your own files go in static/img/brand/ (git-ignored). Set the environment
# variable CONTROL_PANEL_PLACEHOLDER_LOGO=1 to show the neutral placeholder logo even
# when those files exist (e.g. for screenshots you want to publish).
CONTROL_PANEL_PLACEHOLDER_LOGO = os.environ.get("CONTROL_PANEL_PLACEHOLDER_LOGO", "").strip().lower() in (
    "1", "true", "yes", "on")
