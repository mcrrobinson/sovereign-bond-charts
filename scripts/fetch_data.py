#!/usr/bin/env python3
"""Fetch bond yields, debt-to-GDP and currency strength into data/data.json.

Sources (all free, no API key):
  - OECD SDMX API: long-term (10-year) government bond yields, monthly averages
  - BIS SDMX API: nominal effective exchange rate, broad basket (64 economies), 2020 = 100
  - IMF DataMapper API: general government gross debt, % of GDP, annual (WEO)

Standard library only, so it runs in GitHub Actions without installing anything.
"""
import csv
import datetime as dt
import io
import json
import pathlib
import time
import urllib.request

START = "2014-01"

# iso3, iso2, name, group ("adv" = advanced economy, "em" = emerging market; IMF WEO grouping)
COUNTRIES = [
    ("USA", "US", "United States", "adv"),
    ("GBR", "GB", "United Kingdom", "adv"),
    ("JPN", "JP", "Japan", "adv"),
    ("DEU", "DE", "Germany", "adv"),
    ("FRA", "FR", "France", "adv"),
    ("ITA", "IT", "Italy", "adv"),
    ("ESP", "ES", "Spain", "adv"),
    ("PRT", "PT", "Portugal", "adv"),
    ("GRC", "GR", "Greece", "adv"),
    ("BEL", "BE", "Belgium", "adv"),
    ("AUT", "AT", "Austria", "adv"),
    ("NLD", "NL", "Netherlands", "adv"),
    ("IRL", "IE", "Ireland", "adv"),
    ("CHE", "CH", "Switzerland", "adv"),
    ("SWE", "SE", "Sweden", "adv"),
    ("NOR", "NO", "Norway", "adv"),
    ("CAN", "CA", "Canada", "adv"),
    ("AUS", "AU", "Australia", "adv"),
    ("NZL", "NZ", "New Zealand", "adv"),
    ("KOR", "KR", "South Korea", "adv"),
    ("CHN", "CN", "China", "em"),
    ("IND", "IN", "India", "em"),
    ("MEX", "MX", "Mexico", "em"),
    ("ZAF", "ZA", "South Africa", "em"),
    ("POL", "PL", "Poland", "em"),
    ("HUN", "HU", "Hungary", "em"),
    ("COL", "CO", "Colombia", "em"),
]

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "data.json"


# The APIs filter User-Agents differently: OECD returns 403 for urllib's default,
# while the IMF returns 403 for unknown custom ones. Pass ua=None to keep urllib's default.
UA = "sovereign-bond-charts/1.0"


def get(url, ua=UA, tries=4):
    headers = {"User-Agent": ua} if ua else {}
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # network blips and rate limits: back off and retry
            if attempt == tries - 1:
                raise RuntimeError(f"GET {url} failed: {e}") from e
            time.sleep(5 * (attempt + 1))


def fetch_yields():
    keys = "+".join(c[0] for c in COUNTRIES)
    url = (
        "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/"
        f"{keys}.M.IRLT.PA.....?startPeriod={START}&format=csv"
    )
    out = {}
    for row in csv.DictReader(io.StringIO(get(url))):
        if row["OBS_VALUE"]:
            out.setdefault(row["REF_AREA"], {})[row["TIME_PERIOD"]] = round(float(row["OBS_VALUE"]), 3)
    return out


def fetch_neer():
    iso2_to_3 = {c[1]: c[0] for c in COUNTRIES}
    keys = "+".join(iso2_to_3)
    url = f"https://stats.bis.org/api/v1/data/WS_EER/M.N.B.{keys}?startPeriod={START}&format=csv"
    out = {}
    for row in csv.DictReader(io.StringIO(get(url))):
        if row["OBS_VALUE"] and row["REF_AREA"] in iso2_to_3:
            out.setdefault(iso2_to_3[row["REF_AREA"]], {})[row["TIME_PERIOD"]] = round(float(row["OBS_VALUE"]), 2)
    return out


def fetch_debt():
    data = json.loads(get("https://www.imf.org/external/datamapper/api/v1/GGXWDG_NGDP", ua=None))
    series = data["values"]["GGXWDG_NGDP"]
    # WEO includes projections; keep only years up to last year (latest estimate, not a forecast).
    last_year = dt.date.today().year - 1
    out = {}
    for iso3, *_ in COUNTRIES:
        years = series.get(iso3, {})
        out[iso3] = {y: round(v, 1) for y, v in years.items() if v is not None and 2010 <= int(y) <= last_year}
    return out


def main():
    yields, neer, debt = fetch_yields(), fetch_neer(), fetch_debt()
    missing = [c[0] for c in COUNTRIES if not (yields.get(c[0]) and neer.get(c[0]) and debt.get(c[0]))]
    if missing:
        raise SystemExit(f"No data for: {', '.join(missing)}. Check the source APIs before publishing.")

    result = {
        "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
        "sources": {
            "yield": "OECD Main Economic Indicators, long-term interest rates (10-year government bonds), monthly average",
            "neer": "BIS nominal effective exchange rate, broad basket of 64 economies, 2020 = 100",
            "debt": "IMF World Economic Outlook, general government gross debt, % of GDP",
        },
        "countries": [{"iso3": a, "iso2": b, "name": n, "group": g} for a, b, n, g in COUNTRIES],
        "series": {
            c[0]: {"yield": yields[c[0]], "neer": neer[c[0]], "debt": debt[c[0]]} for c in COUNTRIES
        },
    }
    # Leave the file untouched when only the date would change, so the Action only commits new figures.
    if OUT.exists():
        old = json.loads(OUT.read_text())
        if {**old, "updated": None} == {**result, "updated": None}:
            print("No new figures.")
            return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, separators=(",", ":"), sort_keys=True) + "\n")
    latest = {c[0]: max(yields[c[0]]) for c in COUNTRIES}
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(COUNTRIES)} countries, latest yield months {sorted(set(latest.values()))}")


if __name__ == "__main__":
    main()
