"""
Data builder for the Overview page.

Real rows come from the models (DailyMetric, Project, Contact, Activity,
TeamMember). Everything else (plan split, channel revenue split, orders,
workload hours) is INVENTED but derived deterministically from those rows,
so the numbers agree with each other and never change between reloads.

House rules baked in here:
  * every percentage is a float rounded to ONE decimal (templates and JS
    print it with exactly one decimal, e.g. 37.4%)
  * shares that are shown together always sum to exactly 100.0
"""
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from .analytics_data import CHANNELS
from .models import Activity, Contact, Project, TeamMember

# Plan: label, monthly price, share of revenue (invented).
PLANS = [
    ("Starter", 29, 0.142),
    ("Team", 79, 0.318),
    ("Business", 199, 0.379),
    ("Enterprise", 890, 0.161),
]

INVOICE_STATUS = {"paid": "Paid", "open": "Open", "overdue": "Overdue"}
TERMS = ["Net 30", "Net 15", "Net 45", "Due on receipt"]

STATUS_LABEL = {"lead": "Lead", "active": "Customer", "inactive": "Churned", "vip": "Key account"}


def _pct(cur, prev):
    return round((cur - prev) / prev * 100, 1) if prev else 0.0


def _shares(weights):
    """Normalise weights to percentages with 1 decimal that sum to 100.0."""
    total = sum(weights) or 1
    vals = [round(w / total * 100, 1) for w in weights]
    vals[-1] = round(100 - sum(vals[:-1]), 1)
    return vals


def kpis(metrics):
    """Six KPI tiles: last 30 days vs the 30 before. Spark = last 30 days."""
    cur, prev = metrics[-30:], metrics[-60:-30]

    def tot(rows, f):
        return sum(float(getattr(r, f)) for r in rows)

    rev, rev_p = tot(cur, "revenue"), tot(prev, "revenue")
    orders, orders_p = tot(cur, "orders"), tot(prev, "orders")
    vis, vis_p = tot(cur, "visitors"), tot(prev, "visitors")
    sig, sig_p = tot(cur, "signups"), tot(prev, "signups")
    aov, aov_p = (rev / orders if orders else 0), (rev_p / orders_p if orders_p else 0)
    conv, conv_p = (orders / vis * 100 if vis else 0), (orders_p / vis_p * 100 if vis_p else 0)

    def spark(fn):
        return [round(fn(r), 2) for r in cur]

    return [
        {"key": "revenue", "label": "Net revenue", "value": round(rev), "prefix": "$", "suffix": "", "decimals": 0,
         "change": _pct(rev, rev_p), "unit": "%", "spark": spark(lambda r: float(r.revenue))},
        {"key": "orders", "label": "Payments", "value": round(orders), "prefix": "", "suffix": "", "decimals": 0,
         "change": _pct(orders, orders_p), "unit": "%", "spark": spark(lambda r: r.orders)},
        {"key": "aov", "label": "Avg payment", "value": round(aov, 2), "prefix": "$", "suffix": "", "decimals": 2,
         "change": _pct(aov, aov_p), "unit": "%",
         "spark": spark(lambda r: float(r.revenue) / r.orders if r.orders else 0)},
        {"key": "visitors", "label": "Site visitors", "value": round(vis), "prefix": "", "suffix": "", "decimals": 0,
         "change": _pct(vis, vis_p), "unit": "%", "spark": spark(lambda r: r.visitors)},
        {"key": "signups", "label": "Trial signups", "value": round(sig), "prefix": "", "suffix": "", "decimals": 0,
         "change": _pct(sig, sig_p), "unit": "%", "spark": spark(lambda r: r.signups)},
        # Conversion delta is in percentage points (pp), not a relative %.
        {"key": "conversion", "label": "Visit-to-paid", "value": round(conv, 1), "prefix": "", "suffix": "%", "decimals": 1,
         "change": round(conv - conv_p, 1), "unit": " pp",
         "spark": spark(lambda r: r.orders / r.visitors * 100 if r.visitors else 0)},
    ]


def revenue_series(metrics):
    return {
        "dates": [m.date.isoformat() for m in metrics],
        "revenue": [round(float(m.revenue), 2) for m in metrics],
        "orders": [m.orders for m in metrics],
    }


def plans(metrics):
    """Revenue by plan for the last 30 days. JS re-scales `share` per range."""
    rev30 = sum(float(m.revenue) for m in metrics[-30:])
    shares = _shares([s for _, _, s in PLANS])
    rows = []
    for (label, price, _), share in zip(PLANS, shares):
        amount = rev30 * share / 100
        rows.append({"label": label, "price": price, "share": share, "amount": round(amount),
                     "customers": max(1, round(amount / price))})
    return rows


def channels(metrics):
    """Revenue by acquisition channel: visitor share x conversion (invented)."""
    rev30 = sum(float(m.revenue) for m in metrics[-30:])
    shares = _shares([base * conv for _, _, _, base, conv in CHANNELS])
    return [{"label": label, "share": share, "amount": round(rev30 * share / 100)}
            for (_, label, _, _, _), share in zip(CHANNELS, shares)]


def recent_invoices(now, count=8):
    """Invented monthly subscription invoices, attached to real (invented) accounts."""
    buyers = list(Contact.objects.exclude(status="inactive").order_by("-last_contacted", "id")[:count])
    rows = []
    t = now
    for i, c in enumerate(buyers):
        label, price, _ = PLANS[(c.id * 7 + i) % len(PLANS)]
        seats = 5 + (c.id * 3 + i) % (40 if price < 100 else 15)
        amount = price * seats if price < 800 else price * (2 + i % 3)
        status = "overdue" if i == 5 else "open" if i in (1, 6) else "paid"
        t = t - timedelta(hours=3 + (c.id * 37) % 20)
        rows.append({
            "number": f"INV-{t:%y%m}-{4812 - i * 7 - c.id % 5}",
            "account": c.company, "contact": c.name, "plan": label,
            "seats": seats, "amount": amount, "terms": TERMS[(c.id + i) % len(TERMS)],
            "status": status, "status_label": INVOICE_STATUS[status], "issued": t,
        })
    return rows


def activity(now, count=8):
    rows = []
    for a in Activity.objects.select_related("actor")[:count]:
        local = timezone.localtime(a.timestamp)
        same_day = local.date() == timezone.localtime(now).date()
        rows.append({
            "time": local.strftime("%H:%M") if same_day else local.strftime("%b %-d"),
            "iso": local.isoformat(),
            "actor": a.actor.name if a.actor else "System",
            "verb": a.verb, "target": a.target, "amount": a.amount,
        })
    return rows


def contacts(count=6):
    return [{"name": c.name, "company": c.company, "status": c.status,
             "status_label": STATUS_LABEL.get(c.status, c.status), "created": c.created}
            for c in Contact.objects.order_by("-created")[:count]]


def deadlines(today, count=6):
    rows = []
    qs = Project.objects.exclude(status="done").filter(due_date__gte=today).order_by("due_date")[:count]
    for p in qs:
        days = (p.due_date - today).days
        rows.append({"name": p.name, "client": p.client, "due": p.due_date, "progress": p.progress,
                     "days": days,
                     "when": "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days",
                     "soon": days <= 7})
    return rows


def workload():
    """Booked hours this week per person (invented from active project count)."""
    capacity = 40
    rows = []
    members = TeamMember.objects.annotate(
        active=Count("projects", filter=Q(projects__status__in=["active", "review", "planning"]))
    ).order_by("name")
    for m in members:
        booked = min(capacity, 8 + m.active * 3 + (m.id * 7) % 13)
        rows.append({"name": m.name, "role": m.role, "projects": m.active,
                     "booked": booked, "capacity": capacity,
                     "load": round(booked / capacity * 100, 1)})
    rows.sort(key=lambda r: -r["load"])
    return rows


def top_projects(count=5):
    return list(Project.objects.exclude(status="done").order_by("-progress")[:count])


def build_overview_context(metrics):
    now = timezone.now()
    today = timezone.localdate()
    has = len(metrics) >= 60
    return {
        "has_data": has,
        "kpis": kpis(metrics) if has else [],
        "revenue_series": revenue_series(metrics),
        "plans": plans(metrics) if has else [],
        "channels": channels(metrics) if has else [],
        "channels_total": round(sum(float(m.revenue) for m in metrics[-30:])) if has else 0,
        "invoices": recent_invoices(now, 6),
        "activities": activity(now, 6),
        "recent_contacts": contacts(7),
        "deadlines": deadlines(today, 8),
        "workload": workload(),
        "top_projects": top_projects(7),
        "today": today,
    }
