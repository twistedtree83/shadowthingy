# Gnomon

Recover the sun's direction from the shadows in a photograph, then work out when
and where the photo was taken — or show that its claimed time and place are
impossible.

Everything runs in your browser. The image never leaves your machine.

---

## What it does

You drop in a photograph and mark **objects** — three clicks each: the base of
something vertical, its top, and the tip of its shadow. Two objects is enough.

From those clicks Gnomon extracts three families of lines — the verticals, the
shadows lying on the ground, and the rays running from each top to its shadow tip
— and finds where each family converges. Those three vanishing points encode
where the sun was.

It then does three things most tools don't:

**It tells you how much the answer is worth.** Turning image geometry into a real
direction needs the camera's focal length. Gnomon tries five methods in order,
from intact EXIF down to a bare statistical prior, and *the method that succeeded
sets the width of every error bar downstream*. A photo with full metadata gives a
narrow band. A screenshot gives a wide one. The wide band is the correct answer
for a screenshot.

**It calibrates from nothing when it has to.** A vertical object is perpendicular
to the ground; a shadow lies in it. Two orthogonal directions calibrate a camera
on their own — so six clicks are enough even with every scrap of metadata
stripped.

**It checks its own assumptions.** Vertical, shadow and ray are three sides of a
triangle standing on flat ground, so they must be coplanar. That gives a
**residual** computed independently of the calibration. Near zero, the scene
behaves like a real scene. Climbing, something has broken — sloped ground, a
leaning object, lens distortion, or compositing. It's the first number you see.

When EXIF and geometry disagree about the focal length, Gnomon says so and does
not average them. Disagreement is the signature of a crop, a digital zoom, or
fabricated metadata, and it's usually the most interesting thing on screen.

## Three modes

| Mode | You know | You get |
|---|---|---|
| **Verify** | Place and claimed time | A plain-language verdict — *"Claimed time implies a shadow bearing 47° from the one observed — inconsistent."* |
| **Time** | Place and a bearing | The windows of the day that fit, on a 24-hour timeline. Near the solstices there are often two; both are shown. |
| **Locate** | Just the date | A band across the globe where the sun could have been where the shadows say it was. |

## Uncertainty is measured, not derived

Every marked point is perturbed by a few pixels, the focal length is swept across
its tier's range, and the whole pipeline re-runs 500 times. What you see is the
5th, 50th and 95th percentile of that distribution — a band that got wide because
the geometry genuinely is loose.

Where the geometry can't support an answer at all, you get *unbounded*, not a
large number. "We cannot tell" and "we can tell, roughly" are different claims.

## Privacy

The image is never uploaded. There is no backend, no analytics, no error
reporting, and no `localStorage`.

The network is touched exactly once, at page load, for three libraries and a
coastline file — before any image exists, identically for every user.

**There is no tile server, and that's deliberate.** Map tiles are fetched
per-viewport *after* the analysis, so the sequence of requests is the region of
interest — frequently the most sensitive fact in the whole investigation. The
coastline file is bundled because it's the only way to draw a map without handing
that away.

## Run it

Open `gnomon.html`. That's it — no build step, no server, no install. It works
from a `file://` URL on a machine with no toolchain.

```bash
npm run verify      # tests + purity gate + network gate
```

## How it's built

One HTML file, vanilla JS. Inside it, pure core and thin shell:

```
solar · geom · calib · sun · montecarlo · grid · synth   (pure)
canvas · exif · drag · map · report                      (shell)
```

Nothing in the core reads the clock, touches the DOM, or generates its own
randomness. Time arrives as an argument; randomness arrives as a seeded
generator. That's what makes the Monte Carlo reproducible and the synthetic tests
deterministic — a report that can't be reproduced isn't evidence.

The most important test in the project is the **synthetic round trip**: build a
3D scene with a known camera, known sun and known poles, project it to image
coordinates, feed those in as if they were clicks, and assert the recovered
focal length is within 1% and the recovered angles within 0.5°. It runs across
tilted and rolled cameras, because an implementation can be wrong in a way that's
invisible from a level camera. The same generator produces the negative cases —
tilt the ground 10°, lean a pole, and assert the residual rises.

## The rule

**Confidently wrong is the one failure mode this app cannot have.**

A stripped, cropped, or screenshotted image must produce a visibly wide band, not
a narrow one that happens to be wrong. Wherever there's a choice between looking
more precise and being more honest about tolerance, honesty wins.

## Limits

Flat, level ground is assumed — departure from it shows up in the residual, and
that's the extent of it. No lens-distortion correction: barrel and pincushion
violate the pinhole model the whole pipeline rests on, so Gnomon detects them as
a raised residual rather than correcting them. Shadow marking is manual by
design; automatic detection would put a confident failure mode in the one place
the app most needs a human. One image per session, no terrain model, no
artificial light sources, and you supply the UTC offset — there's no timezone
database on board.
