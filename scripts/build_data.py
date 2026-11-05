"""Hämtar välfärdsmått från Kolada och räknar fram ett välfärdsindex för Sveriges kommuner.

Körs av GitHub Actions (se .github/workflows/pages.yml) och skriver site/data.json.
Endast standardbiblioteket används.
"""
import csv
import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

API = "https://api.kolada.se/v3"
FIRST_YEAR = 2002
LAST_YEAR = datetime.now(timezone.utc).year
MIN_COVERAGE = 280  # ett mått räknas in ett år om minst så många kommuner har värde
MIN_SHARE = 0.7     # en kommun får indexvärde om den har värden på minst 70 % av årets mått

# (indexplats, kolada-id, område, namn, enhet, bättre)
MEASURES = [
    ("inkomst", "N00905", "Ekonomi", "Mediannettoinkomst, invånare 20+", "kr", "hog"),
    ("lagstd", "N66080", "Ekonomi", "Invånare med låg ekonomisk standard", "%", "lag"),
    ("lagstd_barn", "N66077", "Ekonomi", "Barn 0–19 år med låg ekonomisk standard", "%", "lag"),
    ("bistand", "N31807", "Ekonomi", "Invånare med ekonomiskt bistånd under året", "%", "lag"),
    ("syss", "N02267", "Arbete", "Sysselsättningsgrad 20–64 år", "%", "hog"),
    ("arbl", "N03941", "Arbete", "Arbetslösa av arbetskraften 18–65 år (BAS)", "%", "lag"),
    ("arbl_lang", "N03926", "Arbete", "Långtidsarbetslösa av befolkningen 25–65 år", "%", "lag"),
    ("uvas", "N02797", "Arbete", "Unga 16–24 år som varken arbetar eller studerar", "%", "lag"),
    ("behorig", "N15428", "Utbildning", "Elever i åk 9 behöriga till yrkesprogram", "%", "hog"),
    ("examen", "N17457", "Utbildning", "Gymnasieexamen eller studiebevis inom 4 år", "%", "hog"),
    ("eftergymn", "N01982", "Utbildning", "Invånare 25–64 år med eftergymnasial utbildning", "%", "hog"),
    ("livsl_m", "N00923", "Hälsa", "Medellivslängd, män", "år", "hog"),
    ("livsl_k", "N00925", "Hälsa", "Medellivslängd, kvinnor", "år", "hog"),
    ("ohalsa", "N00957", "Hälsa", "Ohälsotal", "dagar", "lag"),
    ("fortida", "N01451", "Hälsa", "Förtida dödsfall 25–64 år per 100 000", "antal", "lag"),
    ("vald", "N07403", "Trygghet", "Anmälda våldsbrott per 100 000 invånare", "antal", "lag"),
    ("otrygg", "N07609", "Trygghet", "Otrygg ute sen kväll i eget bostadsområde", "%", "lag"),
    ("trangbodd", "N07907", "Boende", "Trångboddhet i flerbostadshus (norm 2)", "%", "lag"),
    ("valdelt", "N05401", "Delaktighet", "Valdeltagande i senaste kommunvalet", "%", "hog"),
]
# Arbetsförmedlingens äldre serie används för arbetslöshet de år BAS-serien saknas
FALLBACK = {"arbl": ("N03920", "Arbetslösa av befolkningen 18–65 år (Arbetsförmedlingen)")}
# Kärnindex: mått som finns för alla år från 2002, för jämförbarhet över tid
CORE = ["bistand", "behorig", "eftergymn", "livsl_m", "livsl_k", "ohalsa", "valdelt"]


def get(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print(f"  försöker igen ({e})", file=sys.stderr)
            time.sleep(2 * (i + 1))


def get_all(url):
    out = []
    while url:
        j = get(url)
        out.extend(j.get("values", []))
        url = j.get("next_url")
    return out


def fetch_kpi(kpi):
    data = {}
    years = list(range(FIRST_YEAR, LAST_YEAR + 1))
    for i in range(0, len(years), 6):
        chunk = ",".join(str(y) for y in years[i:i + 6])
        for row in get_all(f"{API}/data/kpi/{kpi}/year/{chunk}"):
            v = next((x for x in row.get("values", []) if x.get("gender") == "T"), None)
            if v is None or v.get("value") is None:
                continue
            data.setdefault(row["municipality"], {})[int(row["period"])] = v["value"]
    print(f"{kpi}: {len(data)} enheter", file=sys.stderr)
    return data


def ranks(values, better):
    """Placering 1 = bäst, delade placeringar får medelvärdet, skalat till 290 kommuner."""
    items = sorted(values.items(), key=lambda kv: -kv[1] if better == "hog" else kv[1])
    n = len(items)
    out = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and items[j + 1][1] == items[i][1]:
            j += 1
        r = ((i + j) / 2 + 1)
        for q in range(i, j + 1):
            out[items[q][0]] = r
        i = j + 1
    return out, n


def main():
    muns = get_all(f"{API}/municipality")
    kommuner = {m["id"]: m["title"] for m in muns if m["type"] == "K"}
    print(f"{len(kommuner)} kommuner", file=sys.stderr)

    kpis = [m[1] for m in MEASURES] + [fb[0] for fb in FALLBACK.values()]
    with ThreadPoolExecutor(max_workers=6) as pool:
        raw = dict(zip(kpis, pool.map(fetch_kpi, kpis)))

    better = {m[0]: m[5] for m in MEASURES}
    kpi_of = {m[0]: m[1] for m in MEASURES}

    def series(key, year):
        """Värden för alla kommuner ett år, med reservserie där huvudserien saknas."""
        main_vals = {k: raw[kpi_of[key]].get(k, {}).get(year) for k in kommuner}
        main_vals = {k: v for k, v in main_vals.items() if v is not None}
        if len(main_vals) >= MIN_COVERAGE or key not in FALLBACK:
            return main_vals, kpi_of[key]
        fb = FALLBACK[key][0]
        fb_vals = {k: raw[fb].get(k, {}).get(year) for k in kommuner}
        return {k: v for k, v in fb_vals.items() if v is not None}, fb

    years_with_data = sorted({y for d in raw.values() for m in d.values() for y in m})
    index, core_index, used, rank_out = {}, {}, {}, {}
    for year in years_with_data:
        per_measure = {}
        used_kpis = []
        for key in better:
            vals, src = series(key, year)
            if len(vals) < MIN_COVERAGE:
                continue
            rk, n = ranks(vals, better[key])
            per_measure[key] = {k: r / n * len(kommuner) for k, r in rk.items()}
            used_kpis.append({"key": key, "kpi": src})
            for k, r in rk.items():
                rank_out.setdefault(key, {}).setdefault(k, {})[year] = r
        if not per_measure:
            continue
        used[year] = used_kpis

        def build(keys):
            keys = [k for k in keys if k in per_measure]
            if not keys:
                return {}
            scores = []
            for k in kommuner:
                a = [per_measure[m][k] for m in keys if k in per_measure[m]]
                if len(a) >= MIN_SHARE * len(keys):
                    scores.append((k, sum(a) / len(a)))
            scores.sort(key=lambda x: x[1])
            return {k: {"plats": i + 1, "poang": round(s, 1)} for i, (k, s) in enumerate(scores)}

        index[year] = build(list(better))
        core_index[year] = build(CORE)

    # sista året räknas bara om alla mått finns, annars blir indexet inte jämförbart
    full_years = [y for y in used if len(used[y]) == len(MEASURES)]
    last_full = max(full_years) if full_years else max(used)
    index = {y: v for y, v in index.items() if y <= last_full}
    core_index = {y: v for y, v in core_index.items() if y <= last_full}
    used = {y: v for y, v in used.items() if y <= last_full}

    skane = sorted(k for k in kommuner if k.startswith("12"))
    keep = set(skane) | {"0000"}
    measures_out = []
    for key, kpi, area, title, unit, bet in MEASURES:
        measures_out.append({"key": key, "kolada": kpi, "omrade": area, "namn": title, "enhet": unit,
                             "battre": bet, "kärna": key in CORE})
    for key, (kpi, title) in FALLBACK.items():
        base = next(m for m in MEASURES if m[0] == key)
        measures_out.append({"key": key + "_af", "kolada": kpi, "omrade": base[2], "namn": title,
                             "enhet": base[4], "battre": base[5], "kärna": False, "reserv_for": key})

    values = {}
    for m in measures_out:
        d = raw[m["kolada"]]
        values[m["key"]] = {k: {str(y): round(v, 2) for y, v in sorted(d.get(k, {}).items())}
                            for k in keep if k in d}

    out = {
        "skapad": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "kalla": "Kolada (RKA), med ursprungsdata från bl.a. SCB, Arbetsförmedlingen, Försäkringskassan, BRÅ, Folkhälsomyndigheten och Skolverket",
        "metod": {
            "min_kommuner_per_matt": MIN_COVERAGE,
            "min_andel_matt_per_kommun": MIN_SHARE,
            "sista_fullstandiga_ar": last_full,
            "karna": CORE,
        },
        "kommuner": kommuner,
        "skane": skane,
        "matt": measures_out,
        "matt_per_ar": {str(y): v for y, v in used.items()},
        "index": {str(y): v for y, v in index.items()},
        "karnindex": {str(y): v for y, v in core_index.items()},
        "varden": values,
        "placering": {key: {k: {str(y): r for y, r in sorted(v.items())} for k, v in d.items() if k in keep}
                      for key, d in rank_out.items()},
    }
    with open("site/data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    with open("site/index.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["kommun_id", "kommun", "lan", "ar", "plats", "poang", "karn_plats", "karn_poang", "antal_matt"])
        for y in sorted(index):
            for k in sorted(kommuner):
                a, c = index[y].get(k), core_index[y].get(k)
                w.writerow([k, kommuner[k], "Skåne" if k in skane else "", y, a and a["plats"], a and a["poang"],
                            c and c["plats"], c and c["poang"], len(used[y])])
    with open("site/varden_skane.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["kommun_id", "kommun", "matt", "kolada_id", "omrade", "namn", "enhet", "battre", "ar", "varde", "plats_i_sverige"])
        for m in measures_out:
            for k in sorted(values[m["key"]]):
                for y, v in values[m["key"]][k].items():
                    r = out["placering"].get(m["key"], {}).get(k, {}).get(y) if not m.get("reserv_for") else None
                    w.writerow([k, "Riket" if k == "0000" else kommuner[k], m["key"], m["kolada"], m["omrade"], m["namn"],
                                m["enhet"], m["battre"], y, v, r])
    lk = {y: index[y].get("1282", {}).get("plats") for y in sorted(index)}
    print("Landskrona:", lk, file=sys.stderr)


if __name__ == "__main__":
    main()
