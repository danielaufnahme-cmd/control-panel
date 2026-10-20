"""
python manage.py seed

Wipes the dashboard tables and fills them with rich, INVENTED data.
Deterministic: a fixed random seed means the same data every run (dates are
relative to "today" so the dashboard always looks current).
No external faker dependency - the word lists below are handwritten.
"""
import math
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from dashboard.models import (
    COLOR_CHOICES, Activity, Contact, DailyMetric, Message, Notification, Project, TeamMember,
)

SEED = 1337
COLORS = [c for c, _ in COLOR_CHOICES if c != "slate"]

FIRST = [
    "Ada", "Bram", "Cleo", "Dorian", "Elin", "Felix", "Greta", "Hugo", "Ines", "Jasper",
    "Kaia", "Lionel", "Mara", "Nico", "Odette", "Pavel", "Quinn", "Rosa", "Silas", "Tilda",
    "Umar", "Vera", "Wren", "Xavi", "Yara", "Zane", "Amara", "Bastian", "Celine", "Dax",
    "Esme", "Fintan", "Gaia", "Harlan", "Isla", "Juno", "Kofi", "Lumi", "Milo", "Nadia",
    "Orrin", "Petra", "Rafa", "Saoirse", "Teo", "Una", "Viggo", "Willa", "Ximena", "Yusuf",
]
LAST = [
    "Ashgrove", "Brightwater", "Calloway", "Dunmore", "Ellsworth", "Fairbanks", "Greystone",
    "Holloway", "Ironwood", "Juniper", "Kestrel", "Larkspur", "Merriweather", "Northcott",
    "Oakhurst", "Pembrook", "Quillfeather", "Ravenscroft", "Silverton", "Thornbury",
    "Underhill", "Valemont", "Whitlock", "Yarrow", "Zellweger", "Amberley", "Blackwood",
    "Coldwell", "Driscoll", "Emberton", "Foxley", "Galloway", "Hartwell", "Lindqvist",
]
COMPANIES = [
    "Driftwood Labs", "Northwind Studio", "Pixelforge", "Bluepeak Systems", "Copperleaf Co.",
    "Lumen & Vale", "Orbitron", "Saltmarsh Digital", "Tidewater Analytics", "Quartzline",
    "Fernhill Health", "Ironbark Logistics", "Moonrise Media", "Petalworks", "Kitefield",
    "Hollow Pine", "Sundial Robotics", "Glasswing", "Brambleby", "Vantage Loop",
    "Cobalt Harbor", "Riverstone Foods", "Emberline", "Halcyon Grid", "Opal Systems",
]
ROLES = [
    "Product Manager", "Head of Design", "CTO", "Marketing Lead", "Founder", "Engineering Manager",
    "Operations Director", "Sales Executive", "Data Analyst", "UX Researcher", "CFO",
    "Customer Success", "Brand Strategist", "Growth Lead", "Procurement Officer",
]
CITIES = [
    "Lisbon", "Berlin", "Toronto", "Melbourne", "Austin", "Copenhagen", "Seoul", "Cape Town",
    "Valencia", "Oslo", "Montreal", "Kyoto", "Edinburgh", "Rotterdam", "Wellington", "Denver",
]
TAGS = ["enterprise", "design", "saas", "retail", "priority", "partner", "newsletter",
        "trial", "renewal", "agency", "fintech", "healthcare"]
NOTES = [
    "Interested in the annual plan; follow up after their Q3 planning.",
    "Prefers async updates over calls. Send a recap email after each meeting.",
    "Evaluating us against two other vendors. Pricing is the main concern.",
    "Great champion internally. Introduced us to their ops team.",
    "Asked for a custom onboarding session for 12 seats.",
    "Paused after budget freeze, revisit next quarter.",
    "",
]
PROJECTS = [
    ("Atlas Redesign", "Complete overhaul of the customer portal with a new design system."),
    ("Beacon Mobile App", "Native iOS and Android companion app for field teams."),
    ("Cirrus Data Pipeline", "Streaming ingestion for real-time reporting."),
    ("Delta Onboarding", "Guided onboarding flow to lift week-one activation."),
    ("Echo Support Hub", "Self-serve help center with smart article search."),
    ("Flux Billing v2", "Usage-based billing with prorations and invoices."),
    ("Granite Security Audit", "Annual review of access controls and logging."),
    ("Halo Brand Refresh", "New visual identity, website and marketing kit."),
    ("Iris Analytics Suite", "Embedded dashboards for enterprise customers."),
    ("Juniper Integrations", "Connectors for popular CRMs and calendars."),
    ("Kite Marketing Site", "Fast static marketing site with a CMS."),
    ("Lyra AI Assistant", "In-app assistant that answers workspace questions."),
]
TEAM = [
    ("Alex Rowan", "Workspace admin"), ("Mara Quill", "Account Executive"),
    ("Theo Vance", "Lead Engineer"), ("Juno Hartley", "Product Designer"),
    ("Kian Mercer", "Customer Success"), ("Lena Sorrel", "Marketing Manager"),
    ("Omar Fenwick", "Data Scientist"), ("Priya Lowell", "Project Manager"),
]
SUBJECTS = [
    ("Invoice #{n} is ready", "billing", "Your invoice for this billing period is now available to download."),
    ("Quick question about the API limits", "support", "We're hitting the rate limit during our nightly sync. Is there a way to"),
    ("Kickoff notes: {project}", "work", "Thanks everyone for joining today. Here's a summary of what we agreed on"),
    ("Can we move Thursday's call?", "work", "Something came up on our side, would Friday morning work for your team"),
    ("Design review feedback", "work", "Overall the direction looks great. A few notes on the navigation and"),
    ("Welcome to the community!", "social", "You've been invited to join the Control Panel builders community space where"),
    ("Payment received - thank you", "billing", "We've received your payment. A receipt is attached for your records."),
    ("Bug: export fails on large files", "support", "When exporting more than 10k rows the download stops at around 80%"),
    ("Proposal for Q4 roadmap", "work", "Attached is the draft roadmap. I'd love your input on the priorities for"),
    ("Your weekly digest", "inbox", "Here are the highlights from your workspace this week: 14 new contacts"),
    ("Renewal coming up", "billing", "Just a heads-up that your subscription renews in 14 days. No action needed"),
    ("Loved the new dashboard", "social", "Just wanted to say the new charts are fantastic, the team noticed right"),
    ("Access request for staging", "support", "Could you grant our two new contractors access to the staging workspace"),
    ("Contract draft v3", "work", "Legal made a few small edits to section 4. Changes are highlighted in"),
]
BODY_EXTRA = (
    "\n\nLet me know if you have any questions or if anything here needs clarification. "
    "Happy to jump on a quick call this week if that's easier.\n\nBest,\n{sender}"
)
ACTIVITY_TEMPLATES = [
    ("deal", "closed a deal with", "company", True),
    ("contact", "added a new contact", "person", False),
    ("project", "moved to review", "project", False),
    ("project", "completed a milestone in", "project", False),
    ("message", "replied to", "person", False),
    ("payment", "received a payment from", "company", True),
    ("contact", "scheduled a call with", "person", False),
    ("system", "exported the", "report", False),
]
NOTIFICATIONS = [
    ("New deal closed", "Mara closed $12,400 with Driftwood Labs", "dollar", "emerald"),
    ("Project due soon", "Delta Onboarding is due in 3 days", "clock", "amber"),
    ("3 new signups", "Your trial campaign is performing well", "user-plus", "indigo"),
    ("Server usage at 82%", "Consider upgrading your workspace plan", "alert", "rose"),
    ("Weekly report ready", "Your analytics summary is available", "chart", "sky"),
    ("Comment on Atlas Redesign", "Juno: 'Updated the nav mockups'", "mail", "violet"),
]


class Command(BaseCommand):
    help = "Wipe and seed the database with deterministic invented demo data."

    @transaction.atomic
    def handle(self, *args, **opts):
        rng = random.Random(SEED)
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        today = now.date()

        for model in (Activity, Notification, Message, Project, Contact, TeamMember, DailyMetric):
            model.objects.all().delete()

        def person():
            return f"{rng.choice(FIRST)} {rng.choice(LAST)}"

        def email_for(name, domain=None):
            first, last = name.lower().split()[:2]
            domain = domain or rng.choice(["mail.example", "inbox.example", "post.example"])
            return f"{first}.{last}@{domain}"

        def company_domain(company):
            slug = "".join(ch for ch in company.lower() if ch.isalnum())
            return f"{slug}.example"

        # --- Team ---------------------------------------------------------
        team = []
        for i, (name, role) in enumerate(TEAM):
            team.append(TeamMember.objects.create(
                name=name, role=role, email=email_for(name, "controlpanel.example"),
                avatar_color=COLORS[i % len(COLORS)], online=rng.random() < 0.6,
            ))

        # --- Contacts -----------------------------------------------------
        contacts = []
        statuses = ["lead"] * 4 + ["active"] * 5 + ["inactive"] * 2 + ["vip"]
        for i in range(150):
            name = person()
            company = rng.choice(COMPANIES)
            created = now - timedelta(days=rng.randint(0, 540), hours=rng.randint(0, 23))
            last = created + timedelta(days=rng.randint(0, max(1, (now - created).days)))
            contacts.append(Contact(
                name=name, company=company, email=email_for(name, company_domain(company)),
                phone=f"+1 555 {rng.randint(100, 999)} {rng.randint(1000, 9999)}",
                role=rng.choice(ROLES), status=rng.choice(statuses),
                avatar_color=rng.choice(COLORS), city=rng.choice(CITIES),
                created=created, last_contacted=min(last, now) if rng.random() < 0.85 else None,
                notes=rng.choice(NOTES), tags=",".join(rng.sample(TAGS, rng.randint(0, 3))),
            ))
        Contact.objects.bulk_create(contacts)

        # --- Projects -----------------------------------------------------
        status_pool = ["active", "active", "active", "review", "planning", "paused", "done"]
        for i, (name, desc) in enumerate(PROJECTS):
            status = status_pool[i % len(status_pool)]
            progress = {"done": 100, "planning": rng.randint(3, 15)}.get(status, rng.randint(22, 94))
            budget = Decimal(rng.randrange(8000, 120000, 500))
            p = Project.objects.create(
                name=name, client=rng.choice(COMPANIES), description=desc, status=status,
                progress=progress, due_date=today + timedelta(days=rng.randint(-20, 120)),
                budget=budget, spent=(budget * Decimal(progress) / 100 * Decimal(rng.uniform(0.8, 1.15))).quantize(Decimal("1.00")),
                color=COLORS[i % len(COLORS)],
            )
            p.members.set(rng.sample(team, rng.randint(2, 5)))

        # --- Messages -----------------------------------------------------
        for i in range(40):
            subject, label, preview = rng.choice(SUBJECTS)
            subject = subject.format(n=rng.randint(1040, 1999), project=rng.choice(PROJECTS)[0])
            sender = person()
            received = now - timedelta(hours=int(i * 7 + rng.randint(0, 6)))
            Message.objects.create(
                sender=sender, sender_email=email_for(sender), avatar_color=rng.choice(COLORS),
                subject=subject, preview=preview + "...",
                body=preview + " ..." + BODY_EXTRA.format(sender=sender.split()[0]),
                received=received, unread=i < 9 and rng.random() < 0.8,
                starred=rng.random() < 0.18, label=label,
            )

        # --- Activity feed --------------------------------------------------
        for i in range(60):
            kind, verb, target_kind, money = rng.choice(ACTIVITY_TEMPLATES)
            target = {
                "company": rng.choice(COMPANIES), "person": person(),
                "project": rng.choice(PROJECTS)[0], "report": rng.choice(["monthly revenue report", "Q3 pipeline report", "contacts CSV"]),
            }[target_kind]
            Activity.objects.create(
                actor=rng.choice(team), kind=kind, verb=verb, target=target,
                amount=Decimal(rng.randrange(800, 24000, 50)) if money else None,
                timestamp=now - timedelta(minutes=int(i * 95 + rng.randint(0, 80))),
            )

        # --- Notifications ------------------------------------------------
        for i, (title, body, icon, color) in enumerate(NOTIFICATIONS):
            Notification.objects.create(
                title=title, body=body, icon=icon, color=color,
                created=now - timedelta(minutes=i * 47 + 4), read=i >= 3,
            )

        # --- Daily metrics: 365 days with growth, weekly rhythm, noise ------
        rows = []
        for d in range(365):
            date = today - timedelta(days=364 - d)
            growth = 1 + d / 365 * 0.85                       # ~85% YoY growth
            weekly = 1 - 0.22 * (date.weekday() >= 5)         # weekend dip
            season = 1 + 0.08 * math.sin(d / 365 * 2 * math.pi * 2)
            noise = rng.uniform(0.9, 1.1)
            visitors = int(2400 * growth * weekly * season * noise)
            signups = int(visitors * rng.uniform(0.028, 0.042))
            orders = int(visitors * rng.uniform(0.018, 0.027))
            revenue = Decimal(orders * rng.uniform(58, 74)).quantize(Decimal("1.00"))
            rows.append(DailyMetric(
                date=date, visitors=visitors, signups=signups, orders=orders, revenue=revenue,
                bounce_rate=round(rng.uniform(34, 48) - d / 365 * 4, 1),
                avg_session=int(rng.uniform(140, 260)),
            ))
        DailyMetric.objects.bulk_create(rows)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(team)} team, {len(contacts)} contacts, {len(PROJECTS)} projects, "
            f"40 messages, 60 activities, {len(NOTIFICATIONS)} notifications, 365 daily metrics."
        ))
