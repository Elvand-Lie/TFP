# Implementation Notes — Subtle Destination Arrows

The manager's message is implemented as one stable interaction:

1. select any palace;
2. compute physical targets at +4, +6 and +8;
3. preserve that source selection while time layers change;
4. highlight the source and all three destinations;
5. render three directional SVG paths;
6. fade each path from 1.5% opacity at the source to 23% at the target;
7. terminate with a 5px crimson arrowhead at the destination border.

The visual hierarchy intentionally puts palace highlights ahead of route lines. The lines are supporting evidence, not the primary chart content.
