"""
Z-score standardisation and weighted ZIP scoring.

Algorithm
---------
1. For each feature, compute the population mean and std across all ZCTAs.
2. Standardise each ZCTA's raw value: z = (x - mean) / std
   - std == 0 → z = 0
   - missing value → impute z = 0 (city mean) and add a warning
3. Apply directionality: if higher_is_better is False, flip the sign.
4. Weighted score = Σ(weight_i × directional_z_i)
5. Return ZCTAs sorted descending by score.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple


def _mean_std(values: List[float]) -> Tuple[float, float]:
    """Return (mean, std) of a non-empty list. Returns std=0 when len<2."""
    n = len(values)
    if n == 0:
        return 0.0, 0.0
    mean = sum(values) / n
    if n < 2:
        return mean, 0.0
    variance = sum((v - mean) ** 2 for v in values) / (n - 1)
    return mean, math.sqrt(variance)


def rank_zips(
    data: Dict[str, Dict[str, Optional[float]]],
    features: List[Dict],
) -> Tuple[List[Dict], List[str]]:
    """
    Compute per-feature z-scores and weighted totals for every ZCTA.

    Parameters
    ----------
    data     : {zcta: {feature_name: raw_value_or_None}}
    features : [{"name": str, "weight": float, "higher_is_better": bool}, ...]

    Returns
    -------
    (ranked_list, warnings)

    ranked_list element shape:
        {
            "zip": str,
            "score": float,
            "rank": int,              # set after sorting
            "features": {
                feature_name: {
                    "raw_value": float | None,
                    "z_score": float | None,   # directional (sign already applied)
                    "weight": float,
                    "contribution": float | None,
                }
            }
        }
    """
    warnings: List[str] = []

    if not data or not features:
        return [], warnings

    zctas = list(data.keys())

    # ------------------------------------------------------------------
    # Step 1 & 2: Compute per-feature mean/std and z-scores
    # ------------------------------------------------------------------
    feature_stats: Dict[str, Tuple[float, float]] = {}
    for feat in features:
        fname = feat["name"]
        raw_vals = [
            data[z][fname]
            for z in zctas
            if data[z].get(fname) is not None
        ]
        if len(raw_vals) < 2:
            warnings.append(
                f"Feature '{fname}': fewer than 2 ZCTAs have data — z-scores set to 0."
            )
        feature_stats[fname] = _mean_std(raw_vals) if raw_vals else (0.0, 0.0)

    # ------------------------------------------------------------------
    # Step 3 & 4: Build per-ZCTA score dict
    # ------------------------------------------------------------------
    results: List[Dict] = []

    for zcta in zctas:
        total_score = 0.0
        feature_breakdown: Dict = {}

        for feat in features:
            fname = feat["name"]
            weight = feat["weight"]
            higher = feat["higher_is_better"]

            raw = data[zcta].get(fname)
            mean, std = feature_stats[fname]

            if raw is None:
                # Impute with the city mean → z = 0
                z_raw = 0.0
                imputed = True
            elif std == 0.0:
                z_raw = 0.0
                imputed = False
            else:
                z_raw = (raw - mean) / std
                imputed = False

            # Directionality flip
            z_directional = z_raw if higher else -z_raw
            contribution = weight * z_directional
            total_score += contribution

            feature_breakdown[fname] = {
                "raw_value": raw,
                "z_score": round(z_directional, 6),
                "weight": round(weight, 6),
                "contribution": round(contribution, 6),
                "_imputed": imputed,
            }

        results.append({
            "zip": zcta,
            "score": round(total_score, 6),
            "features": feature_breakdown,
        })

    # ------------------------------------------------------------------
    # Step 5: Sort and assign ranks
    # ------------------------------------------------------------------
    results.sort(key=lambda r: r["score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    return results, warnings
