"""
Analytics page view (self-contained: depends on no helpers in views.py).

The server renders the 30-day KPIs as a no-JS fallback; static/js/pages/
analytics.js re-slices the embedded 365-day payload per range.
"""
from django.shortcuts import render

from .analytics_data import build_analytics_payload
from .models import DailyMetric


def _rel_change(current, previous):
    """Relative change in %, 1 decimal (house rule for every delta)."""
    if not previous:
        return 0.0
    return round((float(current) - float(previous)) / float(previous) * 100, 1)


def _analytics_kpis(metrics):
    """Revenue, visitors, signups, conversion rate: last 30 days vs the 30 before."""
    last30, prev30 = metrics[-30:], metrics[-60:-30]
    spark = metrics[-16:]

    def total(rows, field):
        return sum(float(getattr(r, field)) for r in rows)

    revenue, revenue_prev = total(last30, "revenue"), total(prev30, "revenue")
    visitors, visitors_prev = total(last30, "visitors"), total(prev30, "visitors")
    signups, signups_prev = total(last30, "signups"), total(prev30, "signups")
    orders, orders_prev = total(last30, "orders"), total(prev30, "orders")
    conv = orders / visitors * 100 if visitors else 0
    conv_prev = orders_prev / visitors_prev * 100 if visitors_prev else 0

    def kpi(label, value, change, spark_values, prefix="", suffix="", decimals=0):
        return {"label": label, "value": value, "prefix": prefix, "suffix": suffix,
                "decimals": decimals, "change": change, "spark": spark_values}

    return [
        kpi("Revenue", round(revenue), _rel_change(revenue, revenue_prev),
            [round(float(r.revenue)) for r in spark], prefix="$"),
        kpi("Visitors", round(visitors), _rel_change(visitors, visitors_prev),
            [r.visitors for r in spark]),
        kpi("Signups", round(signups), _rel_change(signups, signups_prev),
            [r.signups for r in spark]),
        kpi("Conversion rate", round(conv, 1), _rel_change(conv, conv_prev),
            [round(r.orders / r.visitors * 100, 2) if r.visitors else 0 for r in spark],
            suffix="%", decimals=1),
    ]


def analytics(request):
    metrics = list(DailyMetric.objects.order_by("date"))
    has_data = len(metrics) >= 14
    context = {
        "page_title": "Analytics",
        "page_subtitle": "Traffic, conversion and revenue trends.",
        "has_data": has_data,
        "kpis": _analytics_kpis(metrics) if len(metrics) >= 60 else [],
        "analytics": build_analytics_payload(metrics) if has_data else None,
    }
    return render(request, "dashboard/analytics.html", context)
