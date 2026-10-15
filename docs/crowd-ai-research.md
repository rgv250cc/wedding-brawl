# Bystander AI for Wedding Brawl

Researched 2026-10-15. "est." marks my own arithmetic or guess.

- **Recommendation:** utility AI with smart objects, plain JS, host only. It works in the artifact, costs nothing per second, and makes needs cause actions (drink, then bladder, then queue, then corner).
- **Jev is not tuned for games.** The models page lists only jev-1.14 and jev-1.13, no game variant. The vendor's real-time demo is Doom at ~10 decisions/s. Choosing one of ~12 actions from 8 numbers is a weighted sum you can write in 10 lines.
- **Jev has two safe, optional jobs:** an offline plausibility judge for simulated traces, and a self-hosted "director". Neither belongs in the 60 fps loop.
- **The brawl is a drive.** A global "fight heat" pulls guests ringside, makes the timid flee, and triggers cheers.

| Approach | Feels alive | Latency, cost per s (est.) | Artifact | Code in brawl.js (est.) | Deterministic | Main failure |
|---|---|---|---|---|---|---|
| Timers + FSM (today) | Low: random, no cause | 0 ms, $0 | Yes | 0 | Seedable | Pukes and pees for no reason |
| Behaviour tree | Medium, scripted | 0 ms, $0 | Yes | ~200 lines | Yes | Every gag is a new branch |
| GOAP / HTN | Medium | ~0 ms, $0 | Yes | ~250 lines | Yes | Plans are 1-2 steps: overkill |
| **Utility + smart objects** | **High** | **<0.1 ms/s CPU, $0** | **Yes** | **~300 lines** | **Yes** | Weights need tuning |
| LLM agents | High talk, unreliable | 1-3 s, ~$5.5/h | Only via `sample` | 600+ lines | No | Slow, costly, off-menu actions |
| Jev hosted | Medium-high | 70-500 ms, ~$0.20/h | No (CSP) | ~110 lines + fallback | No | Latency, 429s |
| Jev local (Ollama) | Same | ~0.2-0.4 s, ~$0.014/h | No | Same | No | Needs the GPU box |
| Utility + Jev director | High | + ~$0.02/h | Utility only | +80 lines | No | Marginal gain |
| Jev offline (tuner, QA) | Same as utility | $0 at runtime | Yes (static) | ~0 | Yes | Text only, no photos |

Determinism does not block any option. Only the host simulates; the guest draws snapshots (<4 KB, ~30/s), so there is no lockstep. Log Jev and LLM inputs and outputs if you want replays.

## Utility AI with smart objects (recommended)

Each guest has needs from 0 to 1: thirst, hunger, bladder, fun, social, energy, nosy. Each object advertises the needs it satisfies; the guest scores the ads against its needs. This is how The Sims works [11][12]. Pick by weighted random among the top 3, not the single best, for variety.

- **Cost:** 7 guests re-deciding at 2 Hz = 14 decisions/s, ~12 options × 7 needs ≈ 100 ops each, so ~1,400 ops/s. Negligible.
- **Visit length matters.** `enter()` sets `stay = 14 + R()*16` seconds, so a guest makes only 2-4 choices. Start guests with random needs (arrives thirsty, arrives needing the loo) instead of slow decay.
- **Fit:** `stroll()` and `arrive()` already walk to `e.dest` and fire on arrival. Replace the `chaos()` timers (puke, faint, flip, gasp) and the `scene()` deck with `decide()`. Keep UFO, doves and disco as set pieces. Net ~300 lines on 1,320 (est.).
- **Online:** append a few `STATES` entries. The object layout is fixed and identical on both ends.
- **Failure modes:** everyone queues at the best-scoring object (Sims players saw sinks used for dishes). Fix with slot, queue and distance penalties. Flip-flopping: add +0.15 to the current action.

## Jev, hosted or local

Re-checked today: $0.042 per million input tokens, output free, 64k tokens per request [2]. My 2026-10-01 note had 40 requests/s and 100k tokens/s; the models page no longer states limits (per organisation, in the console), and excess gets a 429 [2][3]. Latency is "70ms-500ms", measured from US West Coast laptops [1]. I found no independent figure. A 24 ms Minecraft claim does not say what it measures [4].

- **Hosted (est.):** state ≈ 250 tokens + 7 guests × 150 = 1,300 tokens per call, one batched call per second. 1,300 × $0.042/M = $0.000055/s = **$0.20/h**, $0.013 per 4-minute match. 70-500 ms is 4-30 frames; the guest keeps walking meanwhile.
- **Scale:** 100 simultaneous hosts = 100 req/s, $20/h. A public server would batch across matches.
- **Local (est.):** 1,300 tokens ÷ ~13,000 tokens/s prefill on a 4090 ≈ 0.1 s of GPU per second of play (10%). Ollama 0.35 serves `/v1/systemone` with nimble or tev1 [5]. Winnow-12B took 158 ms for 5 questions on a 4090 (community, in [13]). That is no faster than hosted: go local for privacy and no rate limit.
- **Why not in the loop:** reflexes (dodge a bottle, cheer a combo) need under 100 ms, so they stay in code anyway. Jev never returns text, so speech stays authored. It is not random: sample from its probabilities in code [13].
- **Privacy:** state is text. Send roles, never names or photos.
- **Needs** `server.mjs` to hold the key and add `/decide` with a 150 ms timeout and fallback to utility: ~60 server + ~50 client lines (est.).

## LLM agents (Generative Agents style)

Assume 7 guests, one call per 5 s, 800 tokens in, 60 out, at an assumed $1/M in and $5/M out. That is $0.0011 per call × 1.4 calls/s = **$0.0015/s = $5.5/h**, about 28× Jev. Latency 1-3 s (est.) = 60-180 frames. The original study cost roughly $2,000 for 25 agents over 2 game days (Lyfe Agents' estimate) and was not live [6][7]. In the artifact the only route is the `sample` capability: Claude on the viewer's account, with a consent prompt and `rate_limited` errors [8]. Not for real time.

## Behaviour trees, GOAP, HTN, FSM

All free and deterministic, all work in the artifact. The guests' goals are one step ("go to the bar"), so planners (GOAP [9], HTN [10]) plan nothing. A tree suits fighter combat, not "what do I want". Today's timers are an FSM with a random scheduler: nothing causes anything.

## Hybrids

- **Utility + Jev director (self-hosted):** every 5 s send fight state and recent events (~700 tokens) and ask which set piece fires next. 700 ÷ 5 = 140 tokens/s = $0.021/h (est.). A boredom counter does the same. Build last, if at all.
- **Jev offline:** (a) Score questions for per-guest traits: 73 portraits × ~500 tokens ≈ $0.0015 once. But you must write each persona line, and hashed jitter per guest is free. (b) Better: dump per-guest action logs from `probe.mjs` (500 traces × 400 tokens = 200k tokens ≈ $0.008), ask "would a wedding guest do this?", and retune the ads where the answer is no.

## Recommended design

1. Per guest: `needs`, `drunk`, traits (brave, shy, party) hashed from the guest key.
2. `score(o) = Σ ad[need] × need² × trait − 0.5 × distance − 0.3 × queue + 0.15 if current`. Re-decide at 2 Hz.
3. Side effects chain: a drink adds bladder +0.15 and drunk +0.2. At drunk > 0.7 the flip, puke and faint ads appear. A restroom queue over 2 sends the next guest to the corner.
4. Fight: `S.heat` += 0.08 per hit, 0.25 per combo, 0.1 per thrown item, 1 on KO; decays 0.4/s. Two pseudo-objects: **ringside** (6 slots on an arc 0.18-0.26 from the fighters; ad = nosy × heat) and **exit** (ad = (1 − brave) × danger; danger = fighter within 0.12 or a projectile in flight). Cheering stays a reflex (`g.cheer`). As heat falls, the crowd drifts back to the bar.
5. Place objects on the side and back-wall band (z < 0.3), drawn as paper cut-outs like `SHAPES`. The backdrop is a generated picture, so nothing is baked in. Keep the floor centre free for the fight.
6. Objects feed the fight: the bar spawns bottle and champagne items and the buffet spawns plates, so the CPU's loot logic arms the fighters.

## Room objects

| Object | Satisfies | Funny interaction |
|---|---|---|
| Bar | thirst, social | A fighter grabs a bottle off the bar; the guest yells "THAT'S MY ROUND!" |
| Cake and buffet | hunger, fun | The tiers wobble near the fight; a plate hit gives a cream face |
| Dance floor and DJ | fun, social | Record scratch on a KO; 3+ dancers trigger disco |
| Photo booth | fun, social | Three guests squeeze in, feet out; the curtain bulges on punches |
| Restroom door | bladder | A queue of crossed legs; a fainted guest blocks the door |
| Chairs | energy, social | A drunk guest sits where the chair is not and goes down |
| Flower arch | fun, social | A guest slammed into it rains petals and releases the doves |
| Gift table | nosy, social | A nosy guest shakes a box and gasps; Moshik flashes them |

## Sources

1. [TypeSafe, Introducing System One Models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
2. [TypeSafe models page](https://docs.typesafe.ai/models)
3. [TypeSafe API reference](https://docs.typesafe.ai/api)
4. [Runtimewire, Jev Minecraft 24 ms claim](https://runtimewire.com/article/typesafe-jev-minecraft-24ms-demo)
5. [Ollama v0.35.0 release notes](https://github.com/ollama/ollama/releases/tag/v0.35.0)
6. [Park et al., Generative Agents](https://arxiv.org/abs/2304.03442)
7. [Lyfe Agents, low-cost real-time agents](https://arxiv.org/pdf/2310.02172)
8. Claude artifact runtime docs, `sample` capability, contract 0.2.80 (read in this session)
9. [Orkin, Three States and a Plan, GDC 2006](https://gdcvault.com/play/1013282/Three-States-and-a-Plan)
10. [Fluid HTN (Humphreys' HTN approach)](https://github.com/ptrefall/fluid-hierarchical-task-network)
11. [Forbus and Wright, Programming Objects in The Sims](https://qrg.northwestern.edu/papers/Files/Programming_Objects_in_The_Sims.pdf)
12. [Dill and Mark, Utility Theory talk, GDC 2010](https://gdcvault.com/play/1012410/Improving-AI-Decision-Modeling-Through)
13. My notes: /Users/rgv250cc/tmp/jev-city-crowd-sim-research.md, /Users/rgv250cc/tmp/jev-use-cases-local-4090.md
