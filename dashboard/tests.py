"""Smoke tests for the Control Panel dashboard.

Deliberately tolerant of UI/copy changes: they check that pages render, the
seed data exists, and a few structural guarantees of the base template.
"""
import re
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.urls import URLPattern, URLResolver, get_resolver, reverse

from dashboard import urls as dashboard_urls
from dashboard.management.commands import seed as seed_cmd
from dashboard.models import (
    Activity, Contact, DailyMetric, Message, Notification, Project, TeamMember,
)


def _patterns(patterns=None):
    """Yield every URLPattern in dashboard.urls (flattening includes)."""
    for p in patterns if patterns is not None else dashboard_urls.urlpatterns:
        if isinstance(p, URLResolver):
            yield from _patterns(p.url_patterns)
        elif isinstance(p, URLPattern):
            yield p


def _no_arg_names():
    names = []
    for p in _patterns():
        if p.name and not p.pattern.regex.groupindex and p.name not in names:
            names.append(p.name)
    return names


def _id_patterns():
    """(name, kwarg) for every named pattern taking exactly one id-like kwarg."""
    out = []
    for p in _patterns():
        groups = list(p.pattern.regex.groupindex)
        if p.name and len(groups) == 1 and (groups[0] in ("pk", "id") or groups[0].endswith("_id")):
            out.append((p.name, groups[0], str(p.pattern)))
    return out


def _model_for(route):
    """Guess which seeded model a parametrised route refers to."""
    route = route.lower()
    for prefix, model in [
        ("contact", Contact), ("project", Project), ("message", Message),
        ("notification", Notification), ("activit", Activity), ("team", TeamMember),
        ("member", TeamMember),
    ]:
        if prefix in route:
            return model
    return None


class SeedCommandTests(TestCase):
    def test_seed_creates_expected_counts(self):
        out = StringIO()
        call_command("seed", stdout=out)
        self.assertEqual(TeamMember.objects.count(), len(seed_cmd.TEAM))
        self.assertEqual(Contact.objects.count(), 150)
        self.assertEqual(Project.objects.count(), len(seed_cmd.PROJECTS))
        self.assertEqual(Message.objects.count(), 40)
        self.assertEqual(Activity.objects.count(), 60)
        self.assertEqual(Notification.objects.count(), len(seed_cmd.NOTIFICATIONS))
        self.assertEqual(DailyMetric.objects.count(), 365)
        self.assertIn("Seeded", out.getvalue())

    def test_seed_is_idempotent(self):
        call_command("seed", stdout=StringIO())
        call_command("seed", stdout=StringIO())
        self.assertEqual(Contact.objects.count(), 150)
        self.assertEqual(DailyMetric.objects.count(), 365)
        for p in Project.objects.all():
            self.assertGreaterEqual(p.members.count(), 2)


class PageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed", stdout=StringIO())

    def _get_all_pages(self, **params):
        """Fetch every arg-less page; assert 200; return [(name, response)]."""
        names = _no_arg_names()
        self.assertTrue(names, "dashboard.urls has no arg-less named routes")
        pages = []
        for name in names:
            resp = self.client.get(reverse(name), params)
            with self.subTest(url=name):
                self.assertEqual(resp.status_code, 200, f"{name} -> {resp.status_code}")
            if resp.status_code == 200:
                pages.append((name, resp))
        return pages

    @staticmethod
    def _is_html(resp):
        return resp.get("Content-Type", "").startswith("text/html")

    def test_all_pages_return_200(self):
        self._get_all_pages()

    def test_all_pages_render_with_dark_theme_param(self):
        self._get_all_pages(theme="dark")

    def test_no_page_mentions_upgrade_plan(self):
        for name, resp in self._get_all_pages():
            if self._is_html(resp):
                with self.subTest(url=name):
                    self.assertFalse("Upgrade plan" in resp.content.decode(), "page contains 'Upgrade plan'")

    def test_base_template_has_theme_init_and_motion(self):
        for name, resp in self._get_all_pages():
            if not self._is_html(resp):
                continue
            html = resp.content.decode()
            head = html.split("<body", 1)[0]
            inline = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", head, re.S)
            with self.subTest(url=name):
                self.assertRegex(html, r'<script[^>]+src="[^"]*js/motion\.js"')
                # Inline script in <head> that sets the theme before first paint.
                self.assertTrue(
                    any("theme" in s for s in inline),
                    "no inline theme-init script in <head>",
                )

    def test_id_routes_200_for_existing_404_for_missing(self):
        routes = _id_patterns()
        self.assertTrue(routes, "expected at least one id route (contacts/<pk>/)")
        for name, kwarg, route in routes:
            model = _model_for(route) or _model_for(name)
            if model is None:
                continue
            obj = model.objects.order_by("pk").first()
            self.assertIsNotNone(obj, f"no seeded {model.__name__}")
            missing = (model.objects.order_by("-pk").first().pk or 0) + 10_000
            with self.subTest(url=name, route=route):
                ok = self.client.get(reverse(name, kwargs={kwarg: obj.pk}))
                self.assertEqual(ok.status_code, 200)
                nf = self.client.get(reverse(name, kwargs={kwarg: missing}))
                self.assertEqual(nf.status_code, 404)


class BrandLogoTests(TestCase):
    """Logo files come only from static/img/brand/ (git-ignored); otherwise a placeholder."""

    def _render(self, brand_dir, **settings_kw):
        from unittest import mock

        from django.test import override_settings

        with mock.patch("dashboard.context_processors.BRAND_DIR", brand_dir), \
                override_settings(**settings_kw):
            return self.client.get(reverse("overview")).content.decode()

    def test_placeholder_without_files(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as d:
            html = self._render(Path(d))
        self.assertIn("brand-placeholder__mark", html)
        self.assertIn("Control Panel</span>", html)
        self.assertNotIn("img/brand/", html)
        self.assertIn("img/favicon.svg", html)
        self.assertIn("· Control Panel</title>", html)

    def test_files_are_used_and_env_forces_placeholder(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as d:
            for name in ("logo.svg", "logo-dark.svg", "mark.svg"):
                (Path(d) / name).write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
            html = self._render(Path(d), CONTROL_PANEL_PLACEHOLDER_LOGO=False)
            self.assertIn("img/brand/logo.svg", html)
            self.assertIn("img/brand/logo-dark.svg", html)
            self.assertIn("img/brand/mark.svg", html)
            self.assertNotIn("brand-placeholder", html)

            forced = self._render(Path(d), CONTROL_PANEL_PLACEHOLDER_LOGO=True)
            self.assertNotIn("img/brand/", forced)
            self.assertIn("brand-placeholder__mark", forced)
