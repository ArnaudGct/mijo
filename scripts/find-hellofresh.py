"""Resolve only recipes in a private Notion export against the public French catalog."""

import argparse
from collections import Counter
from difflib import SequenceMatcher
import html
import json
import math
from pathlib import Path
import re
import time
import unicodedata
import urllib.error
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET

HOST = "https://www.hellofresh.fr"
AGENT = "Mijo/1.0"
CACHE = Path("data/private/reconciliation")
CACHE.mkdir(parents=True, exist_ok=True)
(CACHE / "recipes").mkdir(exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", nargs="?", default="data/private/import/notion.json")
args = parser.parse_args()
pages = json.loads(Path(args.source).read_text())["pages"]
policy = urllib.robotparser.RobotFileParser()


class PublicRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith(HOST + "/") or not policy.can_fetch(AGENT, newurl):
            raise ValueError("Redirection non autorisée")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


public_pages = urllib.request.build_opener(PublicRedirects())


def fetch(url):
    if not url.startswith(HOST + "/") or not policy.can_fetch(AGENT, url):
        raise ValueError("Page non autorisée")
    for attempt in range(3):
        time.sleep(0.25 + attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENT})
            with public_pages.open(req, timeout=18) as resp:
                if not resp.url.startswith(HOST + "/") or not policy.can_fetch(
                    AGENT, resp.url
                ):
                    raise ValueError("Redirection non autorisée")
                return resp.read(6500000).decode()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return ""
            if exc.code == 429:
                raise RuntimeError("Limite du site. Reprendre ultérieurement.") from exc
            if exc.code < 500 or attempt == 2:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise


with urllib.request.urlopen(HOST + "/robots.txt", timeout=15) as resp:
    policy.parse(resp.read().decode().splitlines())
sitemap = CACHE / "sitemap.xml"
if not sitemap.exists():
    sitemap.write_text(fetch(HOST + "/sitemap_recipe_pages.xml"))
urls = [
    x.text
    for x in ET.fromstring(sitemap.read_bytes()).findall(".//{*}loc")
    if x.text.startswith(HOST + "/recipes/")
]


def norm(s):
    return re.sub(
        r"[^a-z0-9]+",
        " ",
        unicodedata.normalize(
            "NFKD", html.unescape(s).lower().replace("œ", "oe").replace("’", "'")
        )
        .encode("ascii", "ignore")
        .decode(),
    ).strip()


stops = set(
    "a au aux de des du d en la le les l and et facon avec sa son ses un une".split()
)


def tokens(s):
    return {w.rstrip("s") for w in norm(s).split() if w not in stops}


def rid(url):
    return url.rsplit("-", 1)[-1]


def slug(url):
    return url.rsplit("/", 1)[-1].rsplit("-", 1)[0]


catalog = {rid(url): url for url in urls}
entries = [(u, tokens(slug(u))) for u in urls]
freq = Counter(t for _, words in entries for t in words)


def weight(t):
    return math.log(1 + len(entries) / (1 + freq[t]))


def similarity(a, b):
    return sum(weight(t) for t in a & b) / max(1, sum(weight(t) for t in a | b))


def code(s):
    return set(re.findall(r"(?i)(?:[qr](?:fr|nl|uk|de)[0-9]{4,})", s.upper()))


def filename(s):
    return s.split("?")[0].rsplit("/", 1)[-1].lower()


def source(url):
    if not url.startswith(HOST + "/recipes/") or not re.fullmatch(
        r"[a-f0-9]{24}", rid(url)
    ):
        raise ValueError("Adresse de fiche non reconnue")
    dest = CACHE / "recipes" / (rid(url) + ".json")
    if dest.exists():
        cached = json.loads(dest.read_text())
        if cached:
            return cached
    page = fetch(url)
    tag = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.+?)</script>', page, re.S)
    data = (
        json.loads(tag[1])["props"]["pageProps"].get("ssrPayload", {}).get("recipe")
        if tag
        else None
    )
    if data:
        data = {
            k: data.get(k)
            for k in (
                "recipeId",
                "websiteUrl",
                "name",
                "uniqueRecipeCode",
                "imagePath",
                "yields",
                "steps",
                "ingredients",
                "totalTime",
                "prepTime",
                "description",
                "utensils",
                "difficulty",
                "cuisines",
                "tags",
                "nutrition",
                "languageCode",
            )
        }
        for i in data.get("ingredients") or []:
            for k in list(i):
                if k not in ("id", "name", "type", "family"):
                    del i[k]
        for step in data.get("steps") or []:
            for k in list(step):
                if k not in ("index", "instructionsHTML", "instructions", "images"):
                    del step[k]
    if data:
        dest.write_text(json.dumps(data, ensure_ascii=False))
    return data


def evidence(p, d, known):
    a, b = tokens(p["title"]), tokens(d["name"])
    cover = p.get("cover") or ""
    available = norm(d["name"] + " " + " ".join(i["name"] for i in d["ingredients"]))
    # Family codes and covers can be reused when the main ingredient changes.
    for protein in (
        "porc",
        "poulet",
        "boeuf",
        "crevette",
        "saumon",
        "tofu",
        "haddock",
        "dinde",
        "kiwi",
        "mangue",
        "burrata",
        "portobello",
        "poireau",
        "canard",
    ):
        if protein in norm(p["title"]) and protein not in available:
            if protein == "canard" and "canette" in available:
                continue
            return ""
    # A generic Notion title can still identify an exact dish through its step photos and wording.
    if d["recipeId"] in known and len(d["steps"]) >= 3 and len(a) <= 1:
        original = norm(re.sub("<[^>]+>", " ", p["content"]))
        matches = sum(
            SequenceMatcher(
                None,
                norm(re.sub("<[^>]+>", " ", s.get("instructionsHTML") or "")),
                original,
                autojunk=False,
            )
            .find_longest_match()
            .size
            >= 80
            for s in d["steps"]
        )
        if matches >= 3:
            return "identifiant et instructions identiques"
    if filename(cover) and filename(cover) == filename(d.get("imagePath") or ""):
        return "photo identique"
    sim = similarity(a, b)
    full_codes = lambda s: set(
        re.findall(r"[QR](?:FR|NL|UK|DE)[0-9]{4,}-[0-9]+", s.upper())
    )
    if (
        full_codes(cover)
        & full_codes(
            (d.get("uniqueRecipeCode") or "") + " " + (d.get("imagePath") or "")
        )
        and len(a & b) >= 2
    ):
        return "version et ingrédients"
    if (
        code(cover)
        & code((d.get("uniqueRecipeCode") or "") + " " + (d.get("imagePath") or ""))
        and sim >= 0.42
    ):
        return "code recette et titre"
    if a == tokens(slug(d["websiteUrl"])) and len(a) >= 3 and len(a & b) >= 2:
        return "titre de l’adresse officielle et ingrédients"
    if a == b and len(a) >= 2:
        return "titre exact"
    if d["recipeId"] in known and sim >= 0.35:
        return "identifiant et titre"
    # The original may be a documented seasonal variant with a different garnish.
    # Require its source photo ID and family code, and a unique yield supported by
    # at least eight identical quantities. Keep that variant's own ingredients and steps.
    if (
        known
        and code(cover) & code(d.get("uniqueRecipeCode") or "")
        and "### Étape" in p["content"]
    ):
        local = {
            norm(n): (q.strip().replace(",", "."), u.replace("(s)", "").strip())
            for n, q, u in re.findall(
                r"<b>([^<]+)</b>\s*\(([0-9.,]+)\s+([^\n]*?)\)\s*\n", p["content"]
            )
        }
        names = {i["id"]: norm(i["name"]) for i in d["ingredients"]}
        supported = []
        for y in d["yields"]:
            agreed = sum(
                1
                for i in y["ingredients"]
                if names.get(i["id"]) in local
                and i.get("amount")
                and abs(float(local[names[i["id"]]][0]) - i["amount"]) < 0.005
                and local[names[i["id"]]][1] == (i.get("unit") or "").replace("(s)", "")
            )
            if agreed >= 8:
                supported.append(y["yields"])
        if len(supported) == 1:
            return "variante Notion, portions corroborées (" + str(supported[0]) + ")"
    return ""


report = []
manual = (
    json.loads((CACHE / "candidats.json").read_text())
    if (CACHE / "candidats.json").exists()
    else {}
)
for p in pages:
    known = re.findall(r"hellofresh_s3/([a-f0-9]{24})/", p["content"])
    a = tokens(p["title"])
    ranked = sorted(((similarity(a, b), u) for u, b in entries if a & b), reverse=True)
    result = {"id": p["id"], "title": p["title"], "candidates": []}
    if known or p.get("cover") or "⏱" in p["content"]:
        candidates = [
            catalog.get(
                i, HOST + "/recipes/" + norm(p["title"]).replace(" ", "-") + "-" + i
            )
            for i in dict.fromkeys(known)
        ]
        candidates += manual.get(p["title"], [])
        candidates += [u for score, u in ranked[:6] if score > 0.27]
        for u in dict.fromkeys(candidates):
            d = source(u)
            if not d or d.get("languageCode") != "fr-FR":
                continue
            why = evidence(p, d, known)
            result["candidates"].append({"url": d["websiteUrl"], "name": d["name"]})
            if why and d["steps"] and d["ingredients"] and d["yields"]:
                result.update(file=rid(u) + ".json", url=d["websiteUrl"], match=why)
                break
    report.append(result)
    (CACHE / "matches.partial.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2)
    )
    print(len(report), result["title"], result.get("match", "à examiner"), flush=True)

(CACHE / "matches.partial.json").replace(CACHE / "matches.json")
