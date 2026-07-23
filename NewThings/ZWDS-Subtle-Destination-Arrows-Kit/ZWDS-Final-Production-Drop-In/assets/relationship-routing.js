// @ts-check
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZwdsRelationshipRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIDES = ['top', 'right', 'bottom', 'left'];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function localRect(rect, gridRect) {
    return {
      left: rect.left - gridRect.left,
      top: rect.top - gridRect.top,
      right: rect.right - gridRect.left,
      bottom: rect.bottom - gridRect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function facingSide(rect, centerRect) {
    const r = rect;
    const c = centerRect;
    const rcx = (r.left + r.right) / 2;
    const rcy = (r.top + r.bottom) / 2;
    const ccx = (c.left + c.right) / 2;
    const ccy = (c.top + c.bottom) / 2;
    const dx = ccx - rcx;
    const dy = ccy - rcy;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
  }


  function oppositeSide(side) {
    if (side === 'top') return 'bottom';
    if (side === 'right') return 'left';
    if (side === 'bottom') return 'top';
    return 'right';
  }

  function edgeAnchor(rect, side, gridRect, fanOffset, inset) {
    const r = localRect(rect, gridRect);
    const pad = Number.isFinite(inset) ? Number(inset) : 2;
    const fan = Number.isFinite(fanOffset) ? Number(fanOffset) : 0;
    if (side === 'top' || side === 'bottom') {
      return {
        x: clamp((r.left + r.right) / 2 + fan, r.left + 10, r.right - 10),
        y: side === 'top' ? r.top + pad : r.bottom - pad
      };
    }
    return {
      x: side === 'left' ? r.left + pad : r.right - pad,
      y: clamp((r.top + r.bottom) / 2 + fan, r.top + 10, r.bottom - 10)
    };
  }

  function makeRail(centerRect, gridRect, inset) {
    const c = localRect(centerRect, gridRect);
    const i = Math.max(4, Number(inset) || 12);
    return {
      left: c.left + i,
      top: c.top + i,
      right: c.right - i,
      bottom: c.bottom - i,
      width: Math.max(1, c.width - i * 2),
      height: Math.max(1, c.height - i * 2)
    };
  }

  function railPoint(anchor, side, rail) {
    if (side === 'top') return { x: clamp(anchor.x, rail.left, rail.right), y: rail.top };
    if (side === 'right') return { x: rail.right, y: clamp(anchor.y, rail.top, rail.bottom) };
    if (side === 'bottom') return { x: clamp(anchor.x, rail.left, rail.right), y: rail.bottom };
    return { x: rail.left, y: clamp(anchor.y, rail.top, rail.bottom) };
  }

  function perimeterLength(rail) {
    return 2 * (rail.width + rail.height);
  }

  function perimeterValue(point, side, rail) {
    if (side === 'top') return clamp(point.x - rail.left, 0, rail.width);
    if (side === 'right') return rail.width + clamp(point.y - rail.top, 0, rail.height);
    if (side === 'bottom') return rail.width + rail.height + clamp(rail.right - point.x, 0, rail.width);
    return rail.width * 2 + rail.height + clamp(rail.bottom - point.y, 0, rail.height);
  }

  function pointAtPerimeter(value, rail) {
    const p = perimeterLength(rail);
    let v = ((value % p) + p) % p;
    if (v <= rail.width) return { x: rail.left + v, y: rail.top };
    v -= rail.width;
    if (v <= rail.height) return { x: rail.right, y: rail.top + v };
    v -= rail.height;
    if (v <= rail.width) return { x: rail.right - v, y: rail.bottom };
    v -= rail.width;
    return { x: rail.left, y: rail.bottom - v };
  }

  function pointsAlongPerimeter(startValue, endValue, direction, rail) {
    const p = perimeterLength(rail);
    const breakpoints = [0, rail.width, rail.width + rail.height, rail.width * 2 + rail.height, p];
    const points = [];
    if (direction === 1) {
      const distance = (endValue - startValue + p) % p;
      const stop = startValue + distance;
      for (let cycle = -1; cycle <= 2; cycle += 1) {
        breakpoints.forEach((bp) => {
          const candidate = bp + cycle * p;
          if (candidate > startValue + 0.01 && candidate < stop - 0.01) points.push(pointAtPerimeter(candidate, rail));
        });
      }
      points.sort((a, b) => perimeterValue(a, sideForPoint(a, rail), rail) - perimeterValue(b, sideForPoint(b, rail), rail));
      // Sorting by wrapped scalar is not reliable across the zero point; rebuild by candidate distance.
      return points.sort((a, b) => {
        const av = (perimeterValue(a, sideForPoint(a, rail), rail) - startValue + p) % p;
        const bv = (perimeterValue(b, sideForPoint(b, rail), rail) - startValue + p) % p;
        return av - bv;
      });
    }
    const distance = (startValue - endValue + p) % p;
    const stop = startValue - distance;
    const candidates = [];
    for (let cycle = -2; cycle <= 1; cycle += 1) {
      breakpoints.forEach((bp) => {
        const candidate = bp + cycle * p;
        if (candidate < startValue - 0.01 && candidate > stop + 0.01) candidates.push(candidate);
      });
    }
    candidates.sort((a, b) => b - a);
    return candidates.map((candidate) => pointAtPerimeter(candidate, rail));
  }

  function sideForPoint(point, rail) {
    const epsilon = 0.5;
    if (Math.abs(point.y - rail.top) <= epsilon) return 'top';
    if (Math.abs(point.x - rail.right) <= epsilon) return 'right';
    if (Math.abs(point.y - rail.bottom) <= epsilon) return 'bottom';
    return 'left';
  }

  function dedupe(points) {
    return points.filter((point, index) => {
      if (!index) return true;
      const prev = points[index - 1];
      return Math.abs(point.x - prev.x) > 0.05 || Math.abs(point.y - prev.y) > 0.05;
    });
  }

  function roundedPath(points, radius) {
    const pts = dedupe(points);
    if (!pts.length) return '';
    if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    const r = Math.max(0, Number(radius) || 0);
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const prev = pts[i - 1];
      const current = pts[i];
      const next = pts[i + 1];
      const lenA = Math.hypot(current.x - prev.x, current.y - prev.y);
      const lenB = Math.hypot(next.x - current.x, next.y - current.y);
      if (lenA < 0.1 || lenB < 0.1) continue;
      const radiusAtCorner = Math.min(r, lenA / 2, lenB / 2);
      const entry = {
        x: current.x - ((current.x - prev.x) / lenA) * radiusAtCorner,
        y: current.y - ((current.y - prev.y) / lenA) * radiusAtCorner
      };
      const exit = {
        x: current.x + ((next.x - current.x) / lenB) * radiusAtCorner,
        y: current.y + ((next.y - current.y) / lenB) * radiusAtCorner
      };
      d += ` L ${entry.x.toFixed(2)} ${entry.y.toFixed(2)} Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${exit.x.toFixed(2)} ${exit.y.toFixed(2)}`;
    }
    const last = pts[pts.length - 1];
    return `${d} L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  }

  function route(sourceRect, targetRect, centerRect, gridRect, laneIndex, options) {
    const opts = options || {};
    const lane = Number.isFinite(laneIndex) ? Number(laneIndex) : 0;
    const fanSpacing = Number(opts.fanSpacing) || 9;
    const baseInset = Number(opts.baseInset) || 9;
    const laneSpacing = Number(opts.laneSpacing) || 7;
    const sourceSide = facingSide(sourceRect, centerRect);
    const targetSide = facingSide(targetRect, centerRect);
    const fan = (lane - 1) * fanSpacing;
    const sourceAnchor = edgeAnchor(sourceRect, sourceSide, gridRect, fan, 2);
    const targetAnchor = edgeAnchor(targetRect, targetSide, gridRect, fan, 3);
    const rail = makeRail(centerRect, gridRect, baseInset + lane * laneSpacing);
    const sourceRailSide = oppositeSide(sourceSide);
    const targetRailSide = oppositeSide(targetSide);
    const sourceRail = railPoint(sourceAnchor, sourceRailSide, rail);
    const targetRail = railPoint(targetAnchor, targetRailSide, rail);
    const startValue = perimeterValue(sourceRail, sourceRailSide, rail);
    const endValue = perimeterValue(targetRail, targetRailSide, rail);
    const p = perimeterLength(rail);
    const clockwiseDistance = (endValue - startValue + p) % p;
    const counterDistance = p - clockwiseDistance;
    const direction = clockwiseDistance <= counterDistance ? 1 : -1;
    const corners = pointsAlongPerimeter(startValue, endValue, direction, rail);
    const points = [sourceAnchor, sourceRail].concat(corners, [targetRail, targetAnchor]);
    return {
      d: roundedPath(points, Number(opts.cornerRadius) || 9),
      points,
      rail,
      sourceSide,
      targetSide,
      sourceRailSide,
      targetRailSide,
      direction,
      protectedRect: {
        left: rail.left + (Number(opts.protectedInset) || 20),
        top: rail.top + (Number(opts.protectedInset) || 20),
        right: rail.right - (Number(opts.protectedInset) || 20),
        bottom: rail.bottom - (Number(opts.protectedInset) || 20)
      }
    };
  }

  function pointInsideRect(point, rect) {
    return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
  }

  return {
    SIDES,
    facingSide,
    oppositeSide,
    edgeAnchor,
    makeRail,
    railPoint,
    perimeterValue,
    pointAtPerimeter,
    roundedPath,
    route,
    pointInsideRect
  };
});
