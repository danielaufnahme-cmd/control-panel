"""Overview page view. Data helpers live in dashboard/overview_data.py."""
from django.shortcuts import render

from .models import DailyMetric
from .overview_data import build_overview_context


def overview(request):
    metrics = list(DailyMetric.objects.order_by("date"))
    context = {
        "page_title": "Overview",
        "page_subtitle": "Here's what's happening across your workspace today.",
        **build_overview_context(metrics),
    }
    return render(request, "dashboard/overview.html", context)
