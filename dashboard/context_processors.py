"""
Global template context: sidebar nav, notifications data, fake current user,
and the logo files found in static/img/brand/.
Every template rendered with a request gets these variables.
"""
from pathlib import Path

from django.conf import settings
from django.urls import reverse

from .models import Message, Notification

# (url name, label, icon id in templates/components/icons.html, section)
NAV_ITEMS = [
    ("overview", "Overview", "home", "Main"),
    ("analytics", "Analytics", "chart", "Main"),
    ("contacts", "Contacts", "users", "Workspace"),
    ("projects", "Projects", "folder", "Workspace"),
    ("messages", "Messages", "mail", "Workspace"),
    ("settings", "Settings", "settings", "System"),
]


# Your own logo lives in static/img/brand/ (git-ignored, see its README.md).
# Each slot takes the first file that exists, in this extension order.
BRAND_DIR = Path(settings.BASE_DIR) / "static" / "img" / "brand"
BRAND_SLOTS = ("logo", "logo-dark", "mark", "mark-dark")
BRAND_EXTS = (".svg", ".png", ".webp")


def brand_files():
    """{slot: static path} for the logo files present, e.g. {"logo": "img/brand/logo.svg"}.

    Empty when there are none (a fresh clone), or when the CONTROL_PANEL_PLACEHOLDER_LOGO
    setting (env var, see settings.py) forces the neutral placeholder, e.g. for screenshots.
    Checked per request (a few stat calls), so dropping files in needs no restart.
    """
    if getattr(settings, "CONTROL_PANEL_PLACEHOLDER_LOGO", False):
        return {}
    found = {}
    for slot in BRAND_SLOTS:
        for ext in BRAND_EXTS:
            if (BRAND_DIR / f"{slot}{ext}").is_file():
                found[slot] = f"img/brand/{slot}{ext}"
                break
    return found


def shell(request):
    match = getattr(request, "resolver_match", None)
    current = match.url_name if match else ""
    unread = Message.objects.filter(unread=True).count()

    sections = []
    for name, label, icon, section in NAV_ITEMS:
        if not sections or sections[-1]["title"] != section:
            sections.append({"title": section, "items": []})
        sections[-1]["items"].append({
            "name": name,
            "label": label,
            "icon": icon,
            "url": reverse(name),
            "active": name == current,
            "badge": unread if name == "messages" and unread else None,
        })

    notifications = list(Notification.objects.all()[:6])
    brand = brand_files()
    return {
        # Logo: "logo"/"mark" (+ optional "logo-dark"/"mark-dark" as brand.logo_dark/
        # brand.mark_dark). Missing slots fall back to the placeholder in components/logo.html.
        "brand": {k.replace("-", "_"): v for k, v in brand.items()},
        "product_name": "Control Panel",
        "nav_sections": sections,
        "current_page": current,
        "notifications": notifications,
        "notifications_unread": sum(1 for n in notifications if not n.read),
        # Invented placeholder user shown in the avatar menu.
        "current_user": {"name": "Alex Rowan", "initials": "AR", "role": "Workspace admin",
                         "email": "alex@controlpanel.example"},
    }
