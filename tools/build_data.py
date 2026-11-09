#!/usr/bin/env python3
"""
Builds the static data files relicwise loads at runtime:

  data/game.json    characters, relic pieces/sets, affix (roll) tables, light cones
                    -> from Mar-7th/StarRailRes (game data dump)
  data/builds.json  per-character stat weights, main stats, sets, teammates/teams
                    -> from fribbels/hsr-optimizer (MIT licensed character configs),
                       with a kit-based fallback for characters it doesn't cover yet
  data/meta.json    when/where the data came from

Stdlib only. Run from the repo root:  python3 tools/build_data.py
Set GITHUB_TOKEN to avoid GitHub API rate limits (one API call is made).
"""
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

SRR = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_new/en/"
FRIB_RAW = "https://raw.githubusercontent.com/fribbels/hsr-optimizer/main/"
FRIB_TREE = "https://api.github.com/repos/fribbels/hsr-optimizer/git/trees/main?recursive=1"
FRIB_COMMIT = "https://api.github.com/repos/fribbels/hsr-optimizer/commits?per_page=1"
SRR_COMMIT = "https://api.github.com/repos/Mar-7th/StarRailRes/commits?per_page=1"

UA = "relicwise-data-builder/1.0 (+https://github.com/whoisjoshua/relicwise)"


def get(url, as_json=True, retries=3):
    headers = {"User-Agent": UA}
    if "api.github.com" in url and os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                body = r.read().decode("utf-8")
                return json.loads(body) if as_json else body
        except Exception as e:  # noqa: BLE001 - retry anything transient
            if attempt == retries - 1:
                raise RuntimeError(f"GET {url} failed: {e}") from e
            time.sleep(1.5 * (attempt + 1))


# ---------------------------------------------------------------- stat keys
# Canonical stat keys match the optimizer's `Stats.*` identifiers so the two sources line up 1:1.
PROP_TO_KEY = {
    "HPDelta": "HP", "AttackDelta": "ATK", "DefenceDelta": "DEF",
    "HPAddedRatio": "HP_P", "AttackAddedRatio": "ATK_P", "DefenceAddedRatio": "DEF_P",
    "SpeedDelta": "SPD", "SpeedAddedRatio": "SPD_P",
    "CriticalChanceBase": "CR", "CriticalChance": "CR",
    "CriticalDamageBase": "CD", "CriticalDamage": "CD",
    "StatusProbabilityBase": "EHR", "StatusProbability": "EHR",
    "StatusResistanceBase": "RES", "StatusResistance": "RES",
    "BreakDamageAddedRatioBase": "BE", "BreakDamageAddedRatio": "BE",
    "HealRatioBase": "OHB", "HealRatio": "OHB",
    "SPRatioBase": "ERR", "SPRatio": "ERR",
    "PhysicalAddedRatio": "Physical_DMG", "FireAddedRatio": "Fire_DMG", "IceAddedRatio": "Ice_DMG",
    "ThunderAddedRatio": "Lightning_DMG", "WindAddedRatio": "Wind_DMG",
    "QuantumAddedRatio": "Quantum_DMG", "ImaginaryAddedRatio": "Imaginary_DMG",
    "ElationDamageAddedRatioBase": "Elation", "ElationDamageAddedRatio": "Elation",
    "AllDamageTypeAddedRatio": "DMG",
}
ELEMENT_DMG = {
    "Physical": "Physical_DMG", "Fire": "Fire_DMG", "Ice": "Ice_DMG", "Thunder": "Lightning_DMG",
    "Wind": "Wind_DMG", "Quantum": "Quantum_DMG", "Imaginary": "Imaginary_DMG",
}
SLOT = {"HEAD": "Head", "HAND": "Hands", "BODY": "Body", "FOOT": "Feet", "NECK": "PlanarSphere", "OBJECT": "LinkRope"}
SUBSTATS = ["HP", "ATK", "DEF", "HP_P", "ATK_P", "DEF_P", "SPD", "CR", "CD", "EHR", "RES", "BE"]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


# ---------------------------------------------------------------- game data
def build_game():
    files = ["characters", "character_promotions", "character_skill_trees", "character_skills", "relics",
             "relic_sets", "relic_main_affixes", "relic_sub_affixes", "light_cones", "paths", "elements"]
    with ThreadPoolExecutor(8) as ex:
        raw = dict(zip(files, ex.map(lambda f: get(SRR + f + ".json"), files)))

    paths = {k: {"name": v["name"], "icon": v["icon"]} for k, v in raw["paths"].items()}
    elements = {k: {"name": v["name"], "color": v.get("color"), "icon": v["icon"]} for k, v in raw["elements"].items()}

    names = [c["name"] for c in raw["characters"].values()]
    chars = {}
    for cid, c in raw["characters"].items():
        name = c["name"]
        path_name = paths.get(c["path"], {}).get("name", c["path"])
        if name == "{NICKNAME}":
            name = f"Trailblazer · {path_name}"
            # Two Trailblazer ids per path (caelus / stelle): keep both, they share builds
        elif names.count(name) > 1:
            name = f"{name} · {path_name}"
        promos = raw["character_promotions"].get(cid, {}).get("values", [])
        spd = promos[-1]["spd"]["base"] if promos else 100
        traces = {}
        for tid in c.get("skill_trees", []):
            node = raw["character_skill_trees"].get(tid)
            if not node or not node.get("levels"):
                continue
            props = node["levels"][0].get("properties") or []
            stats = {}
            for p in props:
                key = PROP_TO_KEY.get(p["type"])
                if key:
                    stats[key] = round(stats.get(key, 0) + p["value"], 6)
            if stats:
                traces[tid] = stats
        chars[cid] = {
            "id": cid, "name": name, "rarity": c["rarity"], "path": c["path"], "element": c["element"],
            "spd": spd, "traces": traces,
            "icon": c["icon"], "preview": c["preview"], "portrait": c["portrait"],
        }

    sets = {}
    for sid, s in raw["relic_sets"].items():
        bonus = []
        for tier in s.get("properties", []):
            b = {}
            for p in tier:
                key = PROP_TO_KEY.get(p["type"])
                if key:
                    b[key] = p["value"]
            bonus.append(b)
        sets[sid] = {"id": sid, "name": s["name"], "planar": sid.startswith("3"), "desc": s["desc"],
                     "bonus": bonus, "icon": s["icon"]}

    pieces = {}
    ocr_names = {}
    for tid, r in raw["relics"].items():
        slot = SLOT.get(r["type"])
        if not slot:
            continue
        pieces[tid] = {"set": r["set_id"], "slot": slot, "rarity": r["rarity"], "name": r["name"],
                       "main": r["main_affix_id"], "sub": r["sub_affix_id"], "icon": r["icon"]}
        if r["rarity"] == 5:
            ocr_names[r["name"]] = {"set": r["set_id"], "slot": slot, "tid": tid}

    def affix_table(src, with_steps):
        out = {}
        for gid, g in src.items():
            out[gid] = {}
            for aid, a in g["affixes"].items():
                key = PROP_TO_KEY.get(a["property"])
                if not key:
                    continue
                row = {"stat": key, "base": a["base"], "step": a["step"]}
                if with_steps:
                    row["steps"] = a.get("step_num", 2)
                out[gid][aid] = row
        return out

    light_cones = {k: {"name": v["name"], "rarity": v["rarity"], "path": v["path"], "icon": v["icon"]}
                   for k, v in raw["light_cones"].items()}

    return {
        "characters": chars, "paths": paths, "elements": elements, "sets": sets, "pieces": pieces,
        "ocrNames": ocr_names,
        "mainAffix": affix_table(raw["relic_main_affixes"], False),
        "subAffix": affix_table(raw["relic_sub_affixes"], True),
        "lightCones": light_cones,
    }, raw


# ---------------------------------------------------------------- optimizer configs
def balanced(text, start, open_ch, close_ch):
    """Return text[start:end] for the bracket group opening at text[start]."""
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return text[start:]


def find_group(text, label, open_ch="[", close_ch="]", start=0):
    m = re.compile(re.escape(label) + r"\s*" + re.escape(open_ch)).search(text, start)
    if not m:
        return None, -1
    i = m.end() - 1
    return balanced(text, i, open_ch, close_ch), i


def parse_config(src):
    exports = re.findall(r"export const (\w+): CharacterConfig = \{", src)
    if not exports:
        return None
    m = re.search(r"export const \w+: CharacterConfig = \{.*?\bid: '([^']+)'", src, re.S)
    if not m:
        return None
    cfg = {"export": exports[0], "id": m.group(1)}

    s_idx = src.find("const scoring = ")
    scoring = src[s_idx:] if s_idx >= 0 else ""
    stats_block, _ = find_group(scoring, "stats:", "{", "}")
    weights = {}
    if stats_block:
        for key, val in re.findall(r"\[Stats\.(\w+)\]\s*:\s*([\d.]+)", stats_block):
            weights[key] = float(val)
    cfg["weights"] = weights

    def parse_parts(block):
        out = {}
        if block:
            for part, inner in re.findall(r"\[Parts\.(\w+)\]\s*:\s*\[([^\]]*)\]", block):
                out[part] = re.findall(r"Stats\.(\w+)", inner)
        return out

    parts = parse_parts(find_group(scoring, "parts:", "{", "}")[0])
    # The simulation block (before scoring) often lists the main stats the scoring block leaves open.
    sim_parts = parse_parts(find_group(src[:s_idx] if s_idx >= 0 else src, "parts:", "{", "}")[0])
    for part, stats in sim_parts.items():
        if not parts.get(part) and stats:
            parts[part] = stats
    cfg["parts"] = parts

    rel_block, _ = find_group(src, "relicSets:")
    relic_sets = []
    if rel_block:
        for a, b in re.findall(r"\[\s*Sets\.(\w+)\s*,\s*Sets\.(\w+)\s*,?\s*\]", rel_block):
            relic_sets.append([a, b])
    cfg["relicSets"] = relic_sets

    orn_block, _ = find_group(src, "ornamentSets:")
    cfg["ornamentSets"] = re.findall(r"(?<!\.\.\.)Sets\.(\w+)", orn_block) if orn_block else []

    teams = []
    pos = 0
    while True:
        block, i = find_group(src, "teammates:", start=pos)
        if not block:
            break
        mates = re.findall(r"characterId:\s*(\w+)\.id", block)
        if mates:
            teams.append(mates)
        pos = i + len(block)
    cfg["teams"] = teams

    lc = re.search(r"defaultLightCone:\s*(\w+)\.id", src)
    cfg["lightCone"] = lc.group(1) if lc else None
    so = re.search(r"sortOption:\s*SortOption\.(\w+)", scoring)
    cfg["focus"] = so.group(1) if so else None
    return cfg


def fetch_optimizer():
    tree = get(FRIB_TREE)
    files = [t["path"] for t in tree["tree"]
             if t["type"] == "blob" and t["path"].startswith("src/lib/conditionals/character/")
             and t["path"].endswith(".ts") and ".test." not in t["path"]]
    constants = get(FRIB_RAW + "src/lib/constants/constants.ts", as_json=False)
    sets_block, _ = find_group(constants, "export const Sets =", "{", "}")
    set_names = dict(re.findall(r"(\w+):\s*'((?:[^'\\]|\\.)*)'", sets_block or ""))
    set_names = {k: v.replace("\\'", "'") for k, v in set_names.items()}
    with ThreadPoolExecutor(12) as ex:
        sources = list(ex.map(lambda p: get(FRIB_RAW + p, as_json=False), files))
    configs = [c for c in (parse_config(s) for s in sources) if c]
    return configs, set_names


# ---------------------------------------------------------------- fallback inference
PATH_ROLE = {"Warrior": "dps", "Rogue": "dps", "Mage": "dps", "Warlock": "dot", "Shaman": "support",
             "Knight": "sustain", "Priest": "sustain", "Memory": "dps", "Elation": "dps"}


def infer_build(char, raw_char, skills):
    """Kit-based guess for characters the optimizer doesn't cover yet. Clearly flagged in the UI."""
    trace_stats = {}
    for stats in char["traces"].values():
        for k, v in stats.items():
            trace_stats[k] = trace_stats.get(k, 0) + 1
    text = " ".join(skills.get(s, {}).get("desc", "") for s in raw_char.get("skills", []))
    scale = {"HP_P": text.count("Max HP"), "DEF_P": text.count("DEF"), "ATK_P": text.count("ATK")}
    main_scale = max(scale, key=scale.get) if any(scale.values()) else "ATK_P"
    flat = main_scale.replace("_P", "")
    role = PATH_ROLE.get(char["path"], "dps")
    if "BE" in trace_stats:
        role = "break" if role in ("dps", "dot") else role
    if role == "dps" and "CR" not in trace_stats and "CD" not in trace_stats and char["path"] == "Memory":
        role = "support"

    w = {k: 0 for k in SUBSTATS}
    elem = ELEMENT_DMG.get(char["element"], "ATK_P")
    if role == "dps":
        w.update({"CR": 1, "CD": 1, main_scale: 0.75, flat: 0.75, "SPD": 1})
        parts = {"Body": ["CR", "CD"], "Feet": [main_scale, "SPD"], "PlanarSphere": [elem, main_scale], "LinkRope": [main_scale]}
    elif role == "break":
        w.update({"BE": 1, "SPD": 1, main_scale: 0.5, flat: 0.5})
        parts = {"Body": [main_scale], "Feet": ["SPD"], "PlanarSphere": [main_scale, elem], "LinkRope": ["BE"]}
    elif role in ("debuff", "dot"):
        w.update({"EHR": 1, "SPD": 1, main_scale: 0.75, flat: 0.75})
        parts = {"Body": ["EHR", main_scale], "Feet": ["SPD"], "PlanarSphere": [elem, main_scale], "LinkRope": [main_scale, "ERR"]}
    elif role == "support":
        w.update({"SPD": 1, "HP_P": 0.5, "DEF_P": 0.5, "RES": 0.5, "HP": 0.5, "DEF": 0.5})
        for k in trace_stats:
            if k in w and k != "SPD":
                w[k] = max(w[k], 0.75)
        parts = {"Body": ["HP_P", "DEF_P"], "Feet": ["SPD"], "PlanarSphere": ["HP_P", "DEF_P"], "LinkRope": ["ERR"]}
    else:  # sustain
        w.update({"SPD": 1, main_scale: 1, flat: 0.75, "RES": 0.5})
        body = ["OHB", main_scale] if char["path"] == "Priest" else [main_scale]
        parts = {"Body": body, "Feet": ["SPD"], "PlanarSphere": [main_scale], "LinkRope": ["ERR", main_scale]}
    return {"weights": w, "parts": parts, "relicSets": [], "ornamentSets": [], "teams": [], "lightCone": None,
            "focus": None, "role": role, "source": "inferred"}


def role_of(cfg, char):
    w = cfg["weights"]
    if char["path"] == "Shaman":  # Harmony
        return "support"
    if char["path"] in ("Knight", "Priest"):  # Preservation, Abundance
        return "sustain"
    if "OHB" in cfg["parts"].get("Body", []) and w.get("CR", 0) < 0.5:  # healers outside Abundance
        return "sustain" if max(w.get("HP_P", 0), w.get("DEF_P", 0)) >= 1 else "support"
    if cfg.get("focus") == "DOT":
        return "dot"
    if w.get("BE", 0) >= 1 and w.get("CR", 0) < 0.5:
        return "break"
    if w.get("CR", 0) >= 0.75 or w.get("CD", 0) >= 0.75:
        return "dps"
    if char["path"] in ("Knight", "Priest"):
        return "sustain"
    if char["path"] == "Warlock":
        return "dot" if w.get("ATK_P", 0) >= 1 and w.get("EHR", 0) >= 0.5 else "debuff"
    return "support"


def build_builds(game, raw, configs, set_names):
    lc_by_norm = {norm(v["name"]): k for k, v in game["lightCones"].items()}
    set_by_norm = {norm(v["name"]): k for k, v in game["sets"].items()}
    export_to_id = {c["export"]: c["id"] for c in configs}

    def set_id(key):
        name = set_names.get(key)
        return set_by_norm.get(norm(name)) if name else None

    def char_ok(cid):
        return cid.split("b")[0] in game["characters"]

    builds = {}
    for cfg in configs:
        cid = cfg["id"]
        if not char_ok(cid):
            continue  # unreleased in the game data dump
        base = game["characters"][cid.split("b")[0]]
        weights = {k: cfg["weights"].get(k, 0) for k in SUBSTATS}
        if not any(weights.values()):
            continue
        relic_sets = []
        for a, b in cfg["relicSets"]:
            ia, ib = set_id(a), set_id(b)
            if ia and ib:
                pair = [ia, ib]
                if pair not in relic_sets:
                    relic_sets.append(pair)
        orn = []
        for o in cfg["ornamentSets"]:
            i = set_id(o)
            if i and i not in orn:
                orn.append(i)
        teams = []
        for t in cfg["teams"]:
            ids = [export_to_id.get(x) for x in t]
            ids = [i for i in ids if i and char_ok(i)]
            if ids and ids not in teams:
                teams.append(ids)
        lc = None
        if cfg["lightCone"]:
            lc = lc_by_norm.get(norm(re.sub(r"(?<!^)(?=[A-Z])", " ", cfg["lightCone"])))
        b = {"weights": weights, "parts": cfg["parts"], "relicSets": relic_sets, "ornamentSets": orn,
             "teams": teams, "lightCone": lc, "focus": cfg["focus"], "source": "optimizer"}
        b["role"] = role_of(b, base)
        builds[cid] = b

    # Base and enhanced ("b1") versions share a kit lineage: fill gaps from each other.
    for cid, b in builds.items():
        sib = cid.split("b")[0] if "b" in cid else cid + "b1"
        other = builds.get(sib)
        if not other:
            continue
        for key in ("relicSets", "ornamentSets", "teams"):
            if not b[key] and other[key]:
                b[key] = other[key]
                b.setdefault("borrowed", []).append(key)
        if not b["lightCone"] and other["lightCone"]:
            b["lightCone"] = other["lightCone"]

    inferred = 0
    for cid, char in game["characters"].items():
        if cid in builds:
            continue
        # Trailblazers: ids come in caelus/stelle pairs (odd/even); share the sibling's build when it exists.
        if cid.startswith("80"):
            sib = str(int(cid) - 1 if int(cid) % 2 == 0 else int(cid) + 1)
            if sib in builds:
                builds[cid] = dict(builds[sib], alias=sib)
                continue
        builds[cid] = infer_build(char, raw["characters"][cid], raw["character_skills"])
        inferred += 1
    return builds, inferred


def main():
    os.makedirs(OUT, exist_ok=True)
    print("Fetching StarRailRes ...")
    game, raw = build_game()
    print(f"  {len(game['characters'])} characters, {len(game['sets'])} sets, {len(game['pieces'])} relic pieces")
    print("Fetching optimizer character configs ...")
    configs, set_names = fetch_optimizer()
    print(f"  parsed {len(configs)} configs")
    builds, inferred = build_builds(game, raw, configs, set_names)
    print(f"  {len(builds)} builds ({inferred} inferred from kit)")

    def commit(url):
        try:
            c = get(url)[0]
            return {"sha": c["sha"][:10], "date": c["commit"]["committer"]["date"]}
        except Exception:  # noqa: BLE001
            return None

    meta = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": {
            "gameData": {"repo": "https://github.com/Mar-7th/StarRailRes", "commit": commit(SRR_COMMIT)},
            "builds": {"repo": "https://github.com/fribbels/hsr-optimizer", "license": "MIT",
                       "commit": commit(FRIB_COMMIT)},
        },
    }
    for name, obj in (("game.json", game), ("builds.json", builds), ("meta.json", meta)):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        print(f"  wrote data/{name} ({os.path.getsize(os.path.join(OUT, name)) // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
