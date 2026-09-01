#!/usr/bin/env python3
"""Parse OCR label markdown into structured Product Labels JSON + JS embed."""
from __future__ import annotations

import json
import re
from pathlib import Path

SRC = Path("/Users/EGE-XVET/Downloads/Product Labels Aug 31 2026.md")
OUT_JSON = Path("/Users/EGE-XVET/Documents/workshop-tool/data/product_labels.json")
OUT_JS = Path("/Users/EGE-XVET/Documents/workshop-tool/data/product_labels_embed.js")

NAME_TO_ID = {
    "42 degree": "42-degree",
    "aromax": "aromax",
    "aromax dry": "aromax-dry",
    "bacflora br": "bacflora-br",
    "cal d phos": "cal-d-phos",
    "calcium top": "calcium-top",
    "calm me": "smooth-pro-calm-me",
    "e-hydrolyte + c": "e-hydrolyte-c",
    "e-hydrolyte c": "e-hydrolyte-c",
    "globiotic": "globiotic",
    "growaqua": "growaqua",
    "hepatisafe": "hepatisafe",
    "metavolin herbal": "metavolin-herbal",
    "milq": "milq",
    "mineral forte": "mineral-forte",
    "mould guard diamond": "mould-guard-diamond",
    "novosol": "novosol",
    "novovital": "novovital",
    "ovostrong": "ovostrong",
    "pro-start": "pro-start",
    "renal cleaner": "renal-cleaner",
    "tannifit plus": "tannifit-plus",
    "tannifit plus dry": "tannifit-plus-dry",
    "toxi-guard protect se": "toxi-guard-protect-se",
    "turbo fluid": "turbo-fluid",
    "turbo grow": "turbo-grow",
    "vital bee": "vital-bee",
    "vital-x": "vital-x",
    "vitamin ad3eck": "vitamin-ad3eck",
    "vitamin e+se": "vitamin-e-se",
    "vitaquamix": "vitaquamix",
    "x-cid plus": "x-cid-plus",
    "zincotin": "zincotin",
}

MARKERS = [
    ("activity", r"Activity"),
    ("feeding", r"(?:Feeding recommendation|Directions for use)"),
    ("storage", r"Storage"),
    ("additives_header", r"Additives(?: per kg)?"),
    ("nutritional", r"Nutritional additives"),
    ("sensory", r"Sensory additives"),
    ("technological", r"Technological additives"),
    ("zootechnical", r"Other Zootechnical additives|Zootechnical additives"),
    ("gut_flora", r"Gut flora stabilisers"),
    ("digestibility", r"Digestibility enhancers"),
    ("composition", r"Composition"),
    ("analytical", r"Analytical constituents and levels"),
    ("carrier", r"Carrier substance"),
    ("other", r"Other\s*Provisions"),
    ("hazard", r"Hazard-determining components of labelling|Hazard statements|Danger Hazard statements|Precautionary statements"),
]

ADDITIVE_KEYS = {
    "additives_header": "Additives",
    "nutritional": "Nutritional additives",
    "sensory": "Sensory additives",
    "technological": "Technological additives",
    "zootechnical": "Zootechnical additives",
    "gut_flora": "Gut flora stabilisers",
    "digestibility": "Digestibility enhancers",
    "carrier": "Carrier substance",
}

STOP_PREFIXES = (
    "keep well sealed",
    "keep in a dark",
    "keep out of reach",
    "this is an animal",
    "xvetgermany.com",
    "made in germany",
    "made in italy",
    "manufacturing date",
    "best before",
    "batch number",
    "possible colour",
    "possible color",
    "feed manufacturing",
    "health complementary",
    "farm premixture",
    "farm complementary",
    "feed premixture",
    "feed content",
    "feed powder",
    "wsp complementary",
    "containing ",
    "hazard-determining",
    "hazard statements",
    "precautionary statements",
    "danger hazard",
    "ufi:",
    "equivalent to",
)

TRAILING_JUNK = re.compile(
    r"\s+(?:xvetgermany\.com|MADE IN (?:GERMANY|ITALY)|MANUFACTURING DATE|"
    r"BEST BEFORE|BATCH NUMBER|α DE|α ESP|α IT|1 L ℮|1 KG ℮|25 KG ℮|"
    r"500 ML ℮|KEEP well|Keep well|This is an animal).*$",
    re.I,
)


def norm_name(title: str) -> str:
    t = title.strip()
    t = re.sub(r"[®™]", "", t)
    t = t.replace("\\+", "+").replace("\\-", "-")
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t


def clean_text(s: str) -> str:
    s = s.replace("\\-", "-").replace("\\+", "+")
    s = s.replace("\\<", "<").replace("\\>", ">").replace("\\!", "!")
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n+ *", " ", s)
    s = s.replace("®", "")
    s = re.sub(r"\s{2,}", " ", s).strip(" :;,.")
    s = s.replace("HCLinsoluble", "HCL-insoluble")
    s = s.replace("HCL-insoluble ash", "HCL-insoluble ash")
    s = re.sub(r"Crude bre\b", "Crude fibre", s)
    s = s.replace("LMenthol", "L-Menthol")
    s = s.replace("puried", "purified")
    s = s.replace("anhydrum", "anhydrous")
    s = s.replace("dihydrated", "dihydrate")
    s = re.sub(r"(\d+)\s*x\s*10\s*CFU\s*9", r"\1 × 10⁹ CFU", s)
    s = re.sub(r"(\d+)\s*x\s*10\s+9\s*CFU", r"\1 × 10⁹ CFU", s)
    s = re.sub(r"(\d+)\s*x\s*10⁹\s*CFU", r"\1 × 10⁹ CFU", s)
    s = re.sub(r"E 560\\", "E560", s)
    s = re.sub(r"E 560\)", "E560", s)
    s = s.replace("Butyrate de Calcium", "Calcium butyrate")
    s = s.replace("Calcium butyrate ,", "Calcium butyrate,")
    s = re.sub(r"\s+1$", "", s)
    s = re.sub(r"\s+\d+\s*$", lambda m: m.group(0) if re.search(r"mg|IU|CFU|FTU|ml|g|kg|l\b", s, re.I) else "", s)
    return s.strip(" :;,.")


def trim_section(s: str) -> str:
    s = clean_text(s)
    s = TRAILING_JUNK.sub("", s)
    low = s.lower()
    cut = len(s)
    for pref in STOP_PREFIXES:
        i = low.find(pref)
        if i > 12:
            cut = min(cut, i)
    s = s[:cut].strip(" :;,.")
    s = re.sub(r"\s+(?:HEALTH|FARM|WSP|Content|Powder|Premixture)$", "", s, flags=re.I)
    return s.strip(" :;,.")


def split_products(md: str) -> list[tuple[str, str]]:
    parts = re.split(r"(?m)^# ", md)
    out = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        lines = part.splitlines()
        title = lines[0].strip()
        body = "\n".join(lines[1:])
        out.append((title, body))
    return out


def marker_regex() -> re.Pattern:
    alts = "|".join(f"(?P<{k}>{pat})" for k, pat in MARKERS)
    return re.compile(rf"(?:^|(?<=[\s:]))(?:{alts})(?:\s*:)?(?=\s+[A-Z0-9])")


def slice_sections(body: str) -> dict[str, list[str]]:
    text = " " + re.sub(r"\s+", " ", body.replace("\n", " "))
    rx = marker_regex()
    hits = []
    for m in rx.finditer(text):
        kind = next(k for k, v in m.groupdict().items() if v)
        hits.append((m.start(), m.end(), kind))
    hits.append((len(text), len(text), "_end"))
    sections: dict[str, list[str]] = {}
    for i, (start, end, kind) in enumerate(hits[:-1]):
        nxt = hits[i + 1][0]
        chunk = text[end:nxt].strip()
        if kind == "_end":
            continue
        sections.setdefault(kind, []).append(chunk)
    return sections


def parse_constituents(raw: str) -> list[dict]:
    raw = trim_section(raw)
    items = []
    for m in re.finditer(
        r"([A-Za-z][A-Za-z0-9+/().\- ]*?)\s+(\d+(?:\.\d+)?)\s*%",
        raw,
    ):
        name = re.sub(r"\s+", " ", m.group(1)).strip(" ,;:")
        name = name.replace("HCLinsoluble ash", "HCL-insoluble ash")
        name = re.sub(r"^ash$", "Crude ash", name) if False else name
        val = float(m.group(2))
        if val == 0:
            continue
        items.append({"name": name, "value": f"{m.group(2)} %"})
    return items


def split_additive_items(raw: str) -> list[str]:
    s = trim_section(raw)
    if not s:
        return []
    # codes like (3c322v) 8000 mg — split before next Name / or Vitamin
    parts = re.split(
        r"(?<=mg)\s+(?=[A-Z])|(?<=IU)\s+(?=[A-Z])|(?<=mcg)\s+(?=[A-Z])|(?<=CFU)\s+(?=[A-Z])|(?<=FTU)\s+(?=[A-Z])|(?<= g)\s+(?=[A-Z])",
        s,
    )
    out = []
    for p in parts:
        p = p.strip(" ;,")
        p = re.sub(r"\s+", " ", p)
        if len(p) < 4:
            continue
        if p.lower().startswith(("other provisions", "containing", "hazard")):
            continue
        out.append(p)
    return out


def parse_product(title: str, body: str) -> dict | None:
    key = norm_name(title)
    pid = NAME_TO_ID.get(key)
    if not pid:
        print("UNMAPPED", title, "->", key)
        return None
    sec = slice_sections(body)

    title = re.sub(r"[®™]", "", title).strip()
    title = title.replace("\\+", "+").replace("\\-", "-")
    title = re.sub(r"\s+", " ", title)
    activity = trim_section(" ".join(sec.get("activity", [])))
    activity = re.sub(r"\s+\d+$", "", activity).strip()
    feeding = trim_section(" ".join(sec.get("feeding", [])))
    composition = trim_section(" ".join(sec.get("composition", [])))
    carrier = trim_section(" ".join(sec.get("carrier", [])))
    if not composition and carrier:
        composition = carrier
        carrier = ""

    analytical = []
    for chunk in sec.get("analytical", []):
        analytical.extend(parse_constituents(chunk))

    additives = []
    seen_groups = set()
    order = [
        "nutritional",
        "zootechnical",
        "gut_flora",
        "digestibility",
        "technological",
        "sensory",
        "carrier",
        "additives_header",
    ]
    for k in order:
        chunks = sec.get(k, [])
        if not chunks:
            continue
        items = []
        for chunk in chunks:
            items.extend(split_additive_items(chunk))
        # Drop items that are actually another group's leftover
        items = [i for i in items if not re.match(
            r"^(Nutritional|Sensory|Technological|Zootechnical|Gut flora|Digestibility|Carrier|Composition|Analytical|Other)\b",
            i, re.I)]
        if not items:
            continue
        label = ADDITIVE_KEYS[k]
        if k == "additives_header" and any(g["group"] != "Additives" for g in additives):
            # header often repeats subgroups already captured
            leftover = [i for i in items if i not in {x for g in additives for x in g["items"]}]
            if leftover:
                additives.append({"group": "Additives", "items": leftover})
            continue
        if label in seen_groups:
            for g in additives:
                if g["group"] == label:
                    for it in items:
                        if it not in g["items"]:
                            g["items"].append(it)
            continue
        seen_groups.add(label)
        additives.append({"group": label, "items": items})

    if carrier and "Carrier substance" not in seen_groups:
        additives.append({"group": "Carrier substance", "items": [carrier]})

    return {
        "id": pid,
        "name": title,
        "activity": activity,
        "analyticalConstituents": analytical,
        "additives": additives,
        "composition": composition,
        "feedingRecommendation": feeding,
    }


def main() -> None:
    md = SRC.read_text(encoding="utf-8")
    products = []
    for title, body in split_products(md):
        row = parse_product(title, body)
        if row:
            products.append(row)

    payload = {
        "source": "Product Labels Aug 31 2026",
        "products": products,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    js = (
        "const PRODUCT_LABELS_EMBED = "
        + json.dumps(payload, ensure_ascii=False)
        + ";\n"
    )
    OUT_JS.write_text(js, encoding="utf-8")

    print(f"wrote {len(products)} products -> {OUT_JSON}")
    for p in products:
        flags = []
        if not p["activity"]:
            flags.append("NO_ACTIVITY")
        if not p["feedingRecommendation"]:
            flags.append("NO_FEEDING")
        if not p["composition"]:
            flags.append("NO_COMPOSITION")
        if not p["additives"]:
            flags.append("NO_ADDITIVES")
        if not p["analyticalConstituents"]:
            flags.append("NO_ANALYTICAL")
        print(f"  {p['id']:28} act={len(p['activity']):3} feed={len(p['feedingRecommendation']):3} "
              f"comp={len(p['composition']):3} add={sum(len(g['items']) for g in p['additives']):2} "
              f"an={len(p['analyticalConstituents']):2} {' '.join(flags)}")


if __name__ == "__main__":
    main()
