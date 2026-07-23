# ZWDS Subtle Destination Arrows Kit

This revision implements the manager's requested 三方四正 interaction with the restrained visual treatment seen in the reference recording.

## Fixed domain rule

For a clicked palace at physical slot `i`, the three destinations remain:

- first trine: `(i + 4) mod 12`
- opposite palace: `(i + 6) mod 12`
- second trine: `(i + 8) mod 12`

Therefore clicking 命宮 produces:

```text
命宮 → 財帛宮 · 遷移宮 · 官祿宮
```

The relationship remains selected while the displayed chart changes through 本／限／年／月／日／時.

## What changed visually

The previous inner-rail kit was logically correct but the routes were still too prominent. This kit makes the relationship read like the reference:

- the selected palace carries the strongest crimson treatment;
- all three destination palaces use the same restrained related-palace treatment;
- route lines use a source-to-target opacity gradient;
- the route is almost invisible near the source;
- it becomes only slightly more visible near the destination;
- each route ends with a tiny crimson arrowhead on the destination border;
- no target is visually presented as a different arrow type;
- the protected centre information card remains above the routes.

The full lines remain in the DOM and preserve directional meaning, but the user primarily perceives the palace highlights and three small destination indicators.

## Run the isolated test

Double-click:

```text
run.bat
```

Then open:

```text
http://127.0.0.1:8765/relationship-demo.html
```

## Run the production page

Double-click:

```text
run-production.bat
```

The production page uses the supplied ZWDS modules and the same subtle-arrow renderer.

## Tests

Run:

```text
run-tests.bat
```

The tests verify the +4/+6/+8 geometry, three unique targets, time-layer persistence, shared routing, SVG arrowheads, gradient route styling, and source/target highlights.

## Visual validation

Reference renders are included under:

```text
reference/subtle-arrows-demo-desktop.png
reference/subtle-arrows-demo-mobile.png
```

The BaZi, Qimen, date mapping, profile store, time state, view model and calculation adapter remain unchanged.
