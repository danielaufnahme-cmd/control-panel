from django.contrib import admin

from .models import Activity, Contact, DailyMetric, Message, Notification, Project, TeamMember


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "status", "city", "created")
    list_filter = ("status", "city")
    search_fields = ("name", "company", "email")


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "client", "status", "progress", "due_date", "budget")
    list_filter = ("status",)


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ("name", "role", "online")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("subject", "sender", "label", "unread", "starred", "received")
    list_filter = ("label", "unread", "starred")


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("actor", "kind", "verb", "target", "timestamp")
    list_filter = ("kind",)


@admin.register(DailyMetric)
class DailyMetricAdmin(admin.ModelAdmin):
    list_display = ("date", "visitors", "signups", "orders", "revenue", "bounce_rate")
    date_hierarchy = "date"


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "created", "read")
