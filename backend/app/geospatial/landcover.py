from typing import Optional, Tuple

# Official ESA WorldCover 2021 v200 Classification Palette & Semantic Mapping
ESA_WORLDCOVER_CLASSES: dict[int, dict[str, str]] = {
    10: {"name": "Tree cover", "color": "#1E4D33", "fuel_group": "canopy_dense"},
    20: {"name": "Shrubland", "color": "#8A7E4B", "fuel_group": "shrub"},
    30: {"name": "Grassland", "color": "#A3B86C", "fuel_group": "grass"},
    40: {"name": "Cropland", "color": "#C9B467", "fuel_group": "agricultural"},
    50: {"name": "Built-up", "color": "#7B7D7D", "fuel_group": "non_burnable"},
    60: {"name": "Bare / sparse vegetation", "color": "#B8ADA0", "fuel_group": "sparse"},
    70: {"name": "Snow and ice", "color": "#DCE6E8", "fuel_group": "non_burnable"},
    80: {"name": "Permanent water bodies", "color": "#2E6F8E", "fuel_group": "water"},
    90: {"name": "Herbaceous wetland", "color": "#4F8A7B", "fuel_group": "wetland"},
    95: {"name": "Mangroves", "color": "#276654", "fuel_group": "wetland"},
    100: {"name": "Moss and lichen", "color": "#909E7A", "fuel_group": "low_fuel"},
}

TEXT_TO_WORLDCOVER_CODE: dict[str, int] = {
    "tree": 10,
    "tree cover": 10,
    "forest": 10,
    "dense forest": 10,
    "moist deciduous forest": 10,
    "dry deciduous forest": 10,
    "shrub": 20,
    "shrubland": 20,
    "scrub": 20,
    "grass": 30,
    "grassland": 30,
    "savanna": 30,
    "crop": 40,
    "cropland": 40,
    "agriculture": 40,
    "built": 50,
    "built-up": 50,
    "urban": 50,
    "bare": 60,
    "bare / sparse vegetation": 60,
    "barren": 60,
    "snow": 70,
    "water": 80,
    "permanent water bodies": 80,
    "river": 80,
    "lake": 80,
    "wetland": 90,
    "herbaceous wetland": 90,
    "mangroves": 95,
    "moss": 100,
    "moss and lichen": 100,
}


def resolve_landcover(value: object) -> Tuple[Optional[int], str]:
    if value is None:
        return None, "NoData"

    # Numeric ESA WorldCover or integer class
    try:
        numeric = int(float(str(value).strip()))
        if numeric in ESA_WORLDCOVER_CLASSES:
            return numeric, ESA_WORLDCOVER_CLASSES[numeric]["name"]
        return numeric, f"Class {numeric}"
    except (ValueError, TypeError):
        pass

    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "nodata", "na"}:
        return None, "NoData"

    lowered = text.lower()
    if lowered in TEXT_TO_WORLDCOVER_CODE:
        code = TEXT_TO_WORLDCOVER_CODE[lowered]
        return code, ESA_WORLDCOVER_CLASSES[code]["name"]

    for key, code in TEXT_TO_WORLDCOVER_CODE.items():
        if key in lowered:
            return code, text

    return None, text
