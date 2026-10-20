"""
Page views. Each view renders one full page that extends templates/base.html.

Convention: pass `page_title` (shown in the top bar + <title>) and
`page_subtitle` (optional, shown under the title) in every context.
Chart data goes to the template as plain Python lists/dicts and is emitted
with `{{ data|json_script:"some-id" }}` so JS can read it safely.
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.shortcuts import render

from .models import Activity, Contact, DailyMetric, Message, Project, TeamMember


def _pct_change(current, previous):
    if not previous:
        return 0.0
    return round((float(current) - float(previous)) / float(previous) * 100, 1)


def _kpis(metrics):
    """Build the 4 KPI cards from a chronologically ordered metric list."""
    last30, prev30 = metrics[-30:], metrics[-60:-30]
    spark = metrics[-14:]

    def total(rows, field):
        return sum(float(getattr(r, field)) for r in rows)

    revenue, revenue_prev = total(last30, "revenue"), total(prev30, "revenue")
    visitors, visitors_prev = total(last30, "visitors"), total(prev30, "visitors")
    signups, signups_prev = total(last30, "signups"), total(prev30, "signups")
    orders, orders_prev = total(last30, "orders"), total(prev30, "orders")
    conv = orders / visitors * 100 if visitors else 0
    conv_prev = orders_prev / visitors_prev * 100 if visitors_prev else 0

    return [
        {"label": "Revenue", "value": round(revenue), "prefix": "$", "suffix": "", "decimals": 0,
         "change": _pct_change(revenue, revenue_prev), "icon": "dollar", "color": "indigo",
         "spark": [round(float(r.revenue)) for r in spark]},
        {"label": "Visitors", "value": round(visitors), "prefix": "", "suffix": "", "decimals": 0,
         "change": _pct_change(visitors, visitors_prev), "icon": "eye", "color": "sky",
         "spark": [r.visitors for r in spark]},
        {"label": "New signups", "value": round(signups), "prefix": "", "suffix": "", "decimals": 0,
         "change": _pct_change(signups, signups_prev), "icon": "user-plus", "color": "emerald",
         "spark": [r.signups for r in spark]},
        {"label": "Conversion", "value": round(conv, 2), "prefix": "", "suffix": "%", "decimals": 2,
         "change": round(conv - conv_prev, 2), "change_suffix": " pp", "icon": "target", "color": "amber",
         "spark": [round(r.orders / r.visitors * 100, 2) if r.visitors else 0 for r in spark]},
    ]


from .views_overview import overview  # noqa: E402,F401  (Overview view lives in its own module)


from .views_analytics import analytics  # noqa: E402,F401  (Analytics view lives in its own module)


def _contact_payload(c):
    """Plain dict for the contacts page JS (table, grid, drawer)."""
    return {
        "id": c.id, "name": c.name, "initials": c.initials, "company": c.company,
        "email": c.email, "phone": c.phone, "role": c.role, "status": c.status,
        "color": c.avatar_color, "city": c.city, "notes": c.notes, "tags": c.tag_list,
        "created": c.created.isoformat(),
        "last": c.last_contacted.isoformat() if c.last_contacted else None,
    }


def contacts(request, pk=None):
    """Contacts page. /contacts/<pk>/ renders the same page with that contact's
    drawer open (both routes are named "contacts" so the sidebar stays active)."""
    from django.http import Http404
    from django.utils import timezone

    rows = list(Contact.objects.all())
    if pk is not None and not any(c.id == pk for c in rows):
        raise Http404("No such contact")
    now = timezone.now()
    month_ago = now - timedelta(days=30)

    def stat(label, status, icon, color):
        group = [c for c in rows if status is None or c.status == status]
        # Sparkline: contacts in this group touched per week, last 12 weeks.
        spark = []
        for w in range(12, 0, -1):
            lo, hi = now - timedelta(weeks=w), now - timedelta(weeks=w - 1)
            spark.append(sum(1 for c in group if c.last_contacted and lo < c.last_contacted <= hi))
        return {"label": label, "value": len(group), "prefix": "", "suffix": "", "decimals": 0,
                "change": sum(1 for c in group if c.created > month_ago), "change_suffix": " new",
                "icon": icon, "color": color, "spark": spark, "period": "in the last 30 days",
                "status": status or "all"}

    counts = {s: sum(1 for c in rows if c.status == s) for s, _ in Contact.Status.choices}
    context = {
        "page_title": "Contacts",
        "page_subtitle": "Everyone you work with, in one place.",
        "total": len(rows),
        "stats": [
            stat("Total contacts", None, "users", "indigo"),
            stat("Active customers", "active", "check-circle", "emerald"),
            stat("VIP accounts", "vip", "star", "violet"),
            stat("Open leads", "lead", "target", "sky"),
        ],
        "status_tabs": [{"key": "all", "label": "All", "count": len(rows)}] + [
            {"key": k, "label": label, "count": counts[k]}
            for k, label in [("lead", "Lead"), ("active", "Active"), ("vip", "VIP"), ("inactive", "Inactive")]
        ],
        "contacts_data": [_contact_payload(c) for c in rows],
        "team_data": [{"name": m.name, "initials": m.initials, "color": m.avatar_color}
                      for m in TeamMember.objects.all()],
        "open_contact": pk,
    }
    return render(request, "dashboard/contacts.html", context)


# Invented milestone names for the project detail drawer (projects page).
_PROJECT_MILESTONES = [
    "Kickoff & discovery", "Scope signed off", "Wireframes approved", "Visual design",
    "Build: core flows", "Build: integrations", "QA & accessibility pass", "Launch & handover",
]


def _project_payload(p, today):
    """Plain dict for the projects page JS (board, list and detail drawer)."""
    n = 5 + p.id % 3  # 5-7 milestones, deterministic per project
    names = _PROJECT_MILESTONES[:3] + _PROJECT_MILESTONES[-(n - 3):]
    done = round(p.progress / 100 * n)
    start = p.due_date - timedelta(days=24 * n)
    members = list(p.members.all())
    return {
        "id": p.id, "name": p.name, "client": p.client, "description": p.description,
        "status": p.status, "progress": p.progress, "color": p.color,
        "due": p.due_date.isoformat(), "days_left": (p.due_date - today).days,
        "budget": float(p.budget), "spent": float(p.spent),
        "members": [{"id": m.id, "name": m.name, "role": m.role, "initials": m.initials,
                     "color": m.avatar_color, "online": m.online} for m in members],
        "mine": any(m.name == "Alex Rowan" for m in members),  # the fake current user
        "milestones": [{"name": name, "done": i < done,
                        "due": (start + timedelta(days=24 * (i + 1))).isoformat()}
                       for i, name in enumerate(names)],
    }


def projects(request):
    from django.utils import timezone

    qs = Project.objects.prefetch_related("members")
    today = timezone.localdate()
    data = [_project_payload(p, today) for p in qs]
    total_budget = qs.aggregate(s=Sum("budget"))["s"] or Decimal(0)
    total_spent = sum(d["spent"] for d in data)
    open_projects = [d for d in data if d["status"] != "done"]
    stats = [
        {"label": "Active projects", "value": sum(d["status"] == "active" for d in data), "icon": "folder",
         "color": "slate", "change": 12.5, "period": "vs last quarter"},
        {"label": "Total budget", "value": round(float(total_budget)), "prefix": "$", "icon": "dollar",
         "color": "slate", "change": 8.2, "period": "vs last quarter"},
        {"label": "Budget used", "value": round(total_spent / float(total_budget) * 100, 1) if total_budget else 0,
         "suffix": "%", "decimals": 1, "icon": "activity", "color": "slate", "change": -3.4, "period": "of total budget"},
        {"label": "Avg. progress", "value": round(sum(d["progress"] for d in open_projects) / len(open_projects)) if open_projects else 0,
         "suffix": "%", "icon": "target", "color": "slate", "change": 6.1, "period": "open projects"},
    ]
    context = {
        "page_title": "Projects",
        "page_subtitle": "Track progress, budgets and deadlines.",
        "projects": qs,
        "projects_data": data,
        "project_stats": stats,
        "status_choices": Project.Status.choices,
        "total_budget": total_budget,
        "team": TeamMember.objects.all(),
    }
    return render(request, "dashboard/projects.html", context)


def messages_view(request):
    qs = Message.objects.all()
    context = {
        "page_title": "Messages",
        "page_subtitle": "Your team inbox.",
        "messages_list": qs,  # NOT `messages` - that name is reserved by django.contrib.messages
        "messages_data": [
            {"id": m.id, "sender": m.sender, "email": m.sender_email, "initials": m.initials,
             "color": m.avatar_color, "subject": m.subject, "preview": m.preview, "body": m.body,
             "received": m.received.isoformat(), "unread": m.unread, "starred": m.starred, "label": m.label}
            for m in qs
        ],
        "label_choices": Message.Label.choices,
        "unread_count": qs.filter(unread=True).count(),
        "team": TeamMember.objects.all(),
    }
    return render(request, "dashboard/messages.html", context)


def settings_view(request):
    from datetime import date

    def _key(name, env, secret, created, used):
        return {"name": name, "env": env, "key": secret, "created": created, "used": used,
                "masked": secret[:9] + "\u2022" * 16 + secret[-4:]}

    today = date.today().replace(day=1)
    context = {
        "page_title": "Settings",
        "page_subtitle": "Manage your workspace preferences.",
        "team": TeamMember.objects.all(),
        # (key, label, hint, on) - invented defaults, nothing is persisted server-side.
        "notification_rows": [
            ("mentions", "Mentions and replies", "When someone @mentions you or replies to a thread.", True),
            ("projects", "Project updates", "Status changes and milestones on projects you follow.", True),
            ("billing", "Billing alerts", "Failed payments, invoices and plan changes.", True),
            ("digest", "Weekly summary", "A Monday recap of the past week.", False),
            ("product", "Product news", "Occasional notes about new features.", False),
        ],
        "theme_choices": [("light", "Light"), ("dark", "Dark"), ("system", "System")],
        # Accent options for the live picker (colors live in static/css/pages/settings.css).
        "accent_choices": [("teal", "Teal"), ("navy", "Navy"), ("mint", "Mint"), ("graphite", "Near-black")],
        "usage_rows": [
            {"label": "Projects", "text": "12 of 50", "pct": 24},
            {"label": "Storage", "text": "3.8 of 15 GB", "pct": 25},
            {"label": "API calls", "text": "18.2k of 50k", "pct": 36},
        ],
        "invoices": [
            {"number": f"INV-{4821 - i}", "date": (today - timedelta(days=31 * i)).replace(day=1),
             "amount": Decimal("392.00") if i else Decimal("441.00")}
            for i in range(4)
        ],
        "api_keys": [
            _key("Production server", "Live", "nmb_live_8fK2qLx9TzR4mVb7Wc3a91f", "Mar 4, 2026", "2 minutes ago"),
            _key("Staging", "Test", "nmb_test_3Hd7pQe1YuN6sJk0Lf5c27b", "Jun 18, 2026", "yesterday"),
        ],
    }
    return render(request, "dashboard/settings.html", context)
