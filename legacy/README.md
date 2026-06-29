# Legacy Python reference

This folder holds the **original** command-line script that this project started as
(formerly `bk.py`). It is kept only as a reference and as an oracle for cross-checking
the TypeScript port that powers the website. **It is not used by the web app.**

## Install

```bash
python -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
```

> Note: the original `requirements.txt` listed `sklearn`, which is a deprecated dummy
> package that now refuses to install. The correct package is `scikit-learn`, and
> `shapely` (previously only installed via `conda`) is now included here.

## Run

```bash
python drillplan.py <area.csv> <#BOR05> <#BOR10> <#BOR20> <#PB>
```

- `<area.csv>` must contain `Position X` and `Position Y` columns describing the
  vertices of the site outline.
- The four integers are how many holes of each measurement type to place
  (`BOR05`, `BOR10`, `BOR20`, `PB`).

Example — 5 × BOR05, 3 × BOR10, 2 × BOR20, 4 × PB:

```bash
python drillplan.py area.csv 5 3 2 4
```

Outputs `<area>_resultaat.csv` (id, x, y, 0.0, type) and `<area>_afbeelding.png`.

## How it works

1. Build a polygon from the CSV vertices.
2. Sample a grid over the bounding box, keep points inside the polygon, and run
   **K-Means** with `k = total holes`. The cluster centers are evenly spread locations.
3. Randomly assign one measurement type to each location (respecting the requested
   counts), score each assignment by how far apart same-type holes are, and keep the
   best of 20,000 tries.
