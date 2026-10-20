from django.urls import path

from . import views

# URL names are used by the sidebar (see dashboard/context_processors.py).
urlpatterns = [
    path("", views.overview, name="overview"),
    path("analytics/", views.analytics, name="analytics"),
    path("contacts/", views.contacts, name="contacts"),
    # Same page with a contact's drawer open; same name keeps the sidebar item active.
    path("contacts/<int:pk>/", views.contacts, name="contacts"),
    path("projects/", views.projects, name="projects"),
    path("messages/", views.messages_view, name="messages"),
    path("settings/", views.settings_view, name="settings"),
]
