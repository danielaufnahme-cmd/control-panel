"""
Data models for the Control Panel demo. All data is invented by `manage.py seed`.
"""
from django.db import models


# Shared palette keys. Each maps to a CSS custom property `--accent-<key>`
# defined in static/css/tokens.css, so templates can do:
#   style="--c: var(--accent-{{ obj.color }})"
COLOR_CHOICES = [
    ("indigo", "Indigo"),
    ("violet", "Violet"),
    ("pink", "Pink"),
    ("rose", "Rose"),
    ("orange", "Orange"),
    ("amber", "Amber"),
    ("emerald", "Emerald"),
    ("teal", "Teal"),
    ("sky", "Sky"),
    ("slate", "Slate"),
]


class TeamMember(models.Model):
    name = models.CharField(max_length=80)
    role = models.CharField(max_length=80)
    email = models.EmailField()
    avatar_color = models.CharField(max_length=20, choices=COLOR_CHOICES, default="indigo")
    online = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def initials(self):
        return "".join(p[0] for p in self.name.split()[:2]).upper()


class Contact(models.Model):
    class Status(models.TextChoices):
        LEAD = "lead", "Lead"
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        VIP = "vip", "VIP"

    name = models.CharField(max_length=80)
    company = models.CharField(max_length=80)
    email = models.EmailField()
    phone = models.CharField(max_length=30)
    role = models.CharField(max_length=80)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.LEAD)
    avatar_color = models.CharField(max_length=20, choices=COLOR_CHOICES, default="indigo")
    city = models.CharField(max_length=60)
    created = models.DateTimeField()
    last_contacted = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    # Comma-separated tags, e.g. "design,enterprise". Use .tag_list in templates.
    tags = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return self.name

    @property
    def initials(self):
        return "".join(p[0] for p in self.name.split()[:2]).upper()

    @property
    def tag_list(self):
        return [t for t in self.tags.split(",") if t]


class Project(models.Model):
    class Status(models.TextChoices):
        PLANNING = "planning", "Planning"
        ACTIVE = "active", "In progress"
        REVIEW = "review", "In review"
        PAUSED = "paused", "Paused"
        DONE = "done", "Completed"

    name = models.CharField(max_length=80)
    client = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNING)
    progress = models.PositiveSmallIntegerField(default=0)  # 0-100
    due_date = models.DateField()
    budget = models.DecimalField(max_digits=10, decimal_places=2)
    spent = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default="indigo")
    members = models.ManyToManyField(TeamMember, blank=True, related_name="projects")

    class Meta:
        ordering = ["due_date"]

    def __str__(self):
        return self.name


class Message(models.Model):
    class Label(models.TextChoices):
        INBOX = "inbox", "Inbox"
        WORK = "work", "Work"
        BILLING = "billing", "Billing"
        SUPPORT = "support", "Support"
        SOCIAL = "social", "Social"

    sender = models.CharField(max_length=80)
    sender_email = models.EmailField()
    avatar_color = models.CharField(max_length=20, choices=COLOR_CHOICES, default="indigo")
    subject = models.CharField(max_length=160)
    preview = models.CharField(max_length=200)
    body = models.TextField()
    received = models.DateTimeField()
    unread = models.BooleanField(default=True)
    starred = models.BooleanField(default=False)
    label = models.CharField(max_length=10, choices=Label.choices, default=Label.INBOX)

    class Meta:
        ordering = ["-received"]

    def __str__(self):
        return self.subject

    @property
    def initials(self):
        return "".join(p[0] for p in self.sender.split()[:2]).upper()


class Activity(models.Model):
    """A feed item: 'Mara Quill closed deal with Driftwood Labs'."""

    class Kind(models.TextChoices):
        DEAL = "deal", "Deal"
        CONTACT = "contact", "Contact"
        PROJECT = "project", "Project"
        MESSAGE = "message", "Message"
        PAYMENT = "payment", "Payment"
        SYSTEM = "system", "System"

    actor = models.ForeignKey(TeamMember, null=True, blank=True, on_delete=models.SET_NULL)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    verb = models.CharField(max_length=80)      # "closed a deal with"
    target = models.CharField(max_length=120)   # "Driftwood Labs"
    amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    timestamp = models.DateTimeField()

    class Meta:
        ordering = ["-timestamp"]
        verbose_name_plural = "activities"

    def __str__(self):
        return f"{self.actor} {self.verb} {self.target}"


class DailyMetric(models.Model):
    date = models.DateField(unique=True)
    visitors = models.PositiveIntegerField()
    signups = models.PositiveIntegerField()
    orders = models.PositiveIntegerField()
    revenue = models.DecimalField(max_digits=10, decimal_places=2)
    bounce_rate = models.FloatField()  # percent, e.g. 41.3
    avg_session = models.PositiveIntegerField(default=0)  # seconds

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return str(self.date)


class Notification(models.Model):
    """Shown in the top-bar bell dropdown."""

    title = models.CharField(max_length=120)
    body = models.CharField(max_length=200)
    icon = models.CharField(max_length=30, default="bell")  # name of an icon in the sprite
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default="indigo")
    created = models.DateTimeField()
    read = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return self.title
