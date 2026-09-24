# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy"]
# ///
"""Turn recorded races (data/races/*.jsonl.gz) into a behavioral-cloning dataset.

Every tick where a human was driving becomes one (observation, action) sample.
Usage:
    uv run ml/load_races.py                      # summary + writes data/bc_dataset.npz
    uv run ml/load_races.py --out other.npz --min-finish   # only races the human finished
"""
import argparse
import gzip
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def read_race(path):
    meta, ticks, end = None, [], None
    try:
        with gzip.open(path, "rt") as f:
            for line in f:
                row = json.loads(line)
                kind = row.get("type")
                if kind == "meta":
                    meta = row
                elif kind == "tick":
                    ticks.append(row)
                elif kind in ("end", "abort"):
                    end = row
    except (EOFError, gzip.BadGzipFile, json.JSONDecodeError):
        pass  # truncated file (server killed mid-race): keep what was readable
    return meta, ticks, end


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=ROOT / "data" / "races", type=Path)
    ap.add_argument("--out", default=ROOT / "data" / "bc_dataset.npz", type=Path)
    ap.add_argument("--min-finish", action="store_true", help="only keep drivers who finished the race")
    ap.add_argument("--include-countdown", action="store_true", help="keep pre-GO ticks (rocket-start presses)")
    ap.add_argument("--map", help="only races on this map id (e.g. circuit, canyon)")
    args = ap.parse_args()

    obs, act, episode, tick, race_ids, players = [], [], [], [], [], []
    per_player = defaultdict(lambda: {"samples": 0, "races": 0, "places": []})
    obs_names = action_names = None
    episodes = []  # one per (race, human kart)

    for path in sorted(args.data.glob("*.jsonl.gz")):
        meta, ticks, end = read_race(path)
        if not meta or not ticks:
            continue
        if args.map and meta.get("track", {}).get("map", "circuit") != args.map:
            continue
        if obs_names is None:
            obs_names, action_names = meta["obs_names"], meta["action_names"]
        elif meta["obs_names"] != obs_names:
            print(f"skip {path.name}: different observation layout (obs_version {meta['obs_version']})")
            continue
        results = {r["i"]: r for r in (end or {}).get("results", [])}
        for kart in meta["karts"]:
            if not kart["human"]:
                continue
            i, key = kart["i"], str(kart["i"])
            res = results.get(i, {})
            if args.min_finish and not res.get("finished"):
                continue
            ep = len(episodes)
            n = 0
            for t in ticks:
                if key not in t["obs"] or t["src"][i] != "h":
                    continue
                if t["phase"] == "countdown" and not args.include_countdown:
                    continue
                obs.append(t["obs"][key])
                act.append(t["act"][i])
                episode.append(ep)
                tick.append(t["f"])
                n += 1
            if not n:
                continue
            episodes.append({"race": path.name, "map": meta.get("track", {}).get("map", "circuit"), "kart": i, "pid": kart["pid"], "name": kart["name"],
                             "device": kart["device"], "samples": n, "place": res.get("place"),
                             "finished": res.get("finished"), "finish_time": res.get("finish_time")})
            p = per_player[kart["name"]]
            p["samples"] += n
            p["races"] += 1
            if res.get("finished"):
                p["places"].append(res["place"])

    if not obs:
        print(f"No human driving data found in {args.data}")
        return

    obs = np.asarray(obs, dtype=np.float32)
    act = np.asarray(act, dtype=np.float32)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.out, obs=obs, act=act, episode=np.asarray(episode, np.int32), tick=np.asarray(tick, np.int32),
        obs_names=np.asarray(obs_names), action_names=np.asarray(action_names),
        episodes=np.asarray([json.dumps(e) for e in episodes]),
    )

    hz = 60
    print(f"{len(episodes)} driver-episodes, {len(obs):,} samples ({len(obs) / hz / 60:.1f} min of driving)")
    print(f"obs dim {obs.shape[1]}, actions {list(action_names)}")
    print("\nper player:")
    for name, p in sorted(per_player.items(), key=lambda kv: -kv[1]["samples"]):
        avg = f"avg place {np.mean(p['places']):.1f}" if p["places"] else "no finishes"
        print(f"  {name:<12} {p['races']:>3} races  {p['samples'] / hz / 60:6.1f} min  {avg}")
    print("\naction stats: steer mean %.3f std %.3f | gas %.2f brake %.2f drift %.2f item %.3f" % (
        act[:, 0].mean(), act[:, 0].std(), *act[:, 1:].mean(0)))
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
