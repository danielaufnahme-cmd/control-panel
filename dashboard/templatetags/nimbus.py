"""
{% load nimbus %}

  {% icon "home" %}                         -> inline <svg class="icon">
  {% icon "home" "icon--sm extra-class" %}  -> extra classes
  {{ 12400|money }}                         -> "$12,400"
  {{ 12400|compact }}                       -> "12.4k"
  {{ activity.kind|kind_icon }}             -> icon name for an Activity kind
  {{ activity.kind|kind_color }}            -> accent key for an Activity kind
"""
from decimal import Decimal

from django import template
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from dashboard.icons import ICONS

register = template.Library()


@register.simple_tag
def icon(name, extra_class=""):
    paths = ICONS.get(name, ICONS["info"])
    cls = f"icon {extra_class}".strip()
    return format_html(
        '<svg class="{}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{}</svg>',
        cls,
        mark_safe(paths),
    )


@register.filter
def money(value, decimals=0):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return value
    return f"${v:,.{int(decimals)}f}"


@register.filter
def compact(value):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return value
    for div, suffix in ((1e9, "B"), (1e6, "M"), (1e3, "k")):
        if abs(v) >= div:
            return f"{v / div:.1f}".rstrip("0").rstrip(".") + suffix
    return f"{v:.0f}"


_KIND = {
    "deal": ("briefcase", "emerald"),
    "contact": ("user-plus", "sky"),
    "project": ("folder", "violet"),
    "message": ("message", "indigo"),
    "payment": ("credit-card", "amber"),
    "system": ("zap", "slate"),
}


@register.filter
def kind_icon(kind):
    return _KIND.get(kind, ("info", "slate"))[0]


@register.filter
def kind_color(kind):
    return _KIND.get(kind, ("info", "slate"))[1]


@register.filter
def abs_value(value):
    try:
        return abs(value)
    except TypeError:
        return value
