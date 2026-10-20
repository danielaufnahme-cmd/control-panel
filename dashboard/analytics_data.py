"""
Data builder for the Analytics page.

The page ships ALL 365 days to the browser in one json_script payload and
slices it client-side, so switching 7D / 30D / 90D / 12M is instant and every
number and chart can animate to its new value without a reload.

Everything that is not in DailyMetric (funnel trials/paid, channel split,
countries, pages, hour-of-day profile for "Traffic by hour") is INVENTED, but derived
deterministically from the real daily rows so the numbers stay consistent
with each other (e.g. channel visitors always sum to the day's visitors).
"""
import math

# Channel: key, label, (legacy accent key, unused), base share of visitors, signup conversion %
CHANNELS = [
    ("organic", "Organic search", "teal", 0.36, 4.1),
    ("direct", "Direct", "indigo", 0.23, 3.4),
    ("referral", "Referral", "emerald", 0.17, 5.2),
    ("social", "Social", "slate", 0.14, 2.3),
    ("email", "Email", "amber", 0.10, 6.8),
]

# Countries (invented split). The code is only a stable key; the UI shows the name.
COUNTRIES = [
    ("US", "United States", 0.31),
    ("DE", "Germany", 0.14),
    ("GB", "United Kingdom", 0.11),
    ("ES", "Spain", 0.09),
    ("FR", "France", 0.08),
    ("NL", "Netherlands", 0.06),
    ("CA", "Canada", 0.05),
]

# Top pages (all invented paths).
PAGES = [
    ("/", "Home", 0.24, 52, 38.5),
    ("/pricing", "Pricing", 0.13, 94, 29.1),
    ("/features/automations", "Automations", 0.09, 131, 24.6),
    ("/docs/getting-started", "Getting started", 0.08, 248, 18.2),
    ("/guides/invoice-automation", "Guide: Invoice automation", 0.06, 187, 55.3),
    ("/integrations", "Integrations", 0.05, 76, 33.8),
    ("/changelog", "Changelog", 0.04, 63, 47.0),
    ("/demo", "Request a demo", 0.035, 41, 21.4),
]

# Relative traffic by hour of day (0-23), weekday vs weekend. Invented.
HOURLY_WEEKDAY = [
    0.18, 0.12, 0.09, 0.08, 0.09, 0.16, 0.34, 0.58, 0.82, 0.96, 1.0, 0.97,
    0.88, 0.92, 0.97, 0.94, 0.86, 0.74, 0.62, 0.58, 0.55, 0.48, 0.36, 0.25,
]
HOURLY_WEEKEND = [
    0.24, 0.17, 0.12, 0.09, 0.08, 0.09, 0.14, 0.22, 0.34, 0.48, 0.6, 0.66,
    0.68, 0.66, 0.63, 0.6, 0.58, 0.6, 0.64, 0.66, 0.62, 0.52, 0.4, 0.3,
]


def _wave(i, period, amp, phase=0.0):
    return amp * math.sin(i / period + phase)


def build_analytics_payload(metrics):
    """metrics: DailyMetric rows ordered by date. Returns a JSON-ready dict."""
    n = len(metrics)
    visitors = [m.visitors for m in metrics]
    signups = [m.signups for m in metrics]

    # Funnel: trials and paid conversions, drifting gently over time.
    trials = [round(s * (0.44 + _wave(i, 11, 0.05))) for i, s in enumerate(signups)]
    paid = [round(t * (0.36 + _wave(i, 17, 0.05, 1.3))) for i, t in enumerate(trials)]

    # Channel split: shares drift slowly, renormalised so they sum to 1,
    # and the last channel absorbs rounding so the day's total is exact.
    channel_daily = [[] for _ in CHANNELS]
    for i, v in enumerate(visitors):
        raw = [base * (1 + _wave(i, 23 + k * 7, 0.18, k)) for k, (_, _, _, base, _) in enumerate(CHANNELS)]
        total = sum(raw)
        acc = 0
        for k, r in enumerate(raw):
            if k == len(raw) - 1:
                val = v - acc
            else:
                val = round(v * r / total)
                acc += val
            channel_daily[k].append(val)

    return {
        "dates": [m.date.isoformat() for m in metrics],
        "visitors": visitors,
        "signups": signups,
        "orders": [m.orders for m in metrics],
        "revenue": [round(float(m.revenue), 2) for m in metrics],
        "bounce": [m.bounce_rate for m in metrics],
        "session": [m.avg_session for m in metrics],
        "trials": trials,
        "paid": paid,
        "channels": [
            {"key": key, "label": label, "color": color, "conv": conv, "daily": channel_daily[k]}
            for k, (key, label, color, _, conv) in enumerate(CHANNELS)
        ],
        "countries": [{"code": c, "name": nm, "share": s} for c, nm, s in COUNTRIES],
        "pages": [
            {"path": p, "title": t, "share": s, "time": tm, "bounce": b} for p, t, s, tm, b in PAGES
        ],
        "hourly": {"weekday": HOURLY_WEEKDAY, "weekend": HOURLY_WEEKEND},
        "days": n,
    }
