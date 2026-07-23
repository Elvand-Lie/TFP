// @ts-check
(function () {
  'use strict';
  const engine = window.ZwdsEngineAdapter;
  const router = window.ZwdsRelationshipRouter;
  if (!engine) throw new Error('ZwdsEngineAdapter is required.');
  if (!router) throw new Error('ZwdsRelationshipRouter is required.');

  const ROLE_RING = ['life', 'siblings', 'spouse', 'children', 'wealth', 'health', 'travel', 'friends', 'career', 'property', 'fortune', 'parents'];
  const ROLE_EN = { life: 'Life', siblings: 'Siblings', spouse: 'Partner', children: 'Children', wealth: 'Money', health: 'Health', travel: 'Travel', friends: 'Friends', career: 'Career', property: 'Property', fortune: 'Fortune', parents: 'Parents' };
  const LAYERS = { natal: '本命', decadal: '大限', yearly: '流年', monthly: '流月', daily: '流日', hourly: '流時' };
  const LIFE_SLOT = 'yin';
  const branches = engine.BRANCHES;
  const lifeIndex = branches.findIndex((branch) => branch.id === LIFE_SLOT);
  const palaces = branches.map((branch, index) => {
    const role = ROLE_RING[(index - lifeIndex + 12) % 12];
    return { slotId: branch.id, branch: branch.symbol, role, label: engine.PALACE_ROLE_LABELS[role], english: ROLE_EN[role] };
  });

  const grid = document.getElementById('demo-grid');
  const overlay = /** @type {SVGSVGElement} */ (document.getElementById('demo-overlay'));
  const readout = document.getElementById('demo-readout');
  const status = document.getElementById('demo-status');
  let selectedSlot = LIFE_SLOT;
  let activeLayer = 'natal';

  function palaceMarkup(palace) {
    return `<button class="palace" type="button" data-slot="${palace.slotId}" aria-pressed="false"><small>${palace.english}</small><span style="display:flex"><strong>${palace.label}</strong><span class="branch">${palace.branch}</span></span><span class="stars">紫微 · 天府 · 武曲 · 天相</span><span class="footer"><span>${LAYERS[activeLayer]}</span><span>三合</span></span></button>`;
  }

  function renderGrid() {
    grid.innerHTML = palaces.map(palaceMarkup).join('') + '<section class="center"><div><span>Current display</span><b>' + LAYERS[activeLayer] + '</b><p>Click any palace<br>Three subtle destination arrows</p></div></section>';
  }

  function appendDefinitions() {
    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');
    const marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', 'demo-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9.1');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '5');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('orient', 'auto');
    const shape = document.createElementNS(ns, 'path');
    shape.setAttribute('class', 'relationship-arrowhead');
    shape.setAttribute('d', 'M0 1.2 L10 5 L0 8.8 Z');
    marker.append(shape);
    defs.append(marker);
    overlay.append(defs);
    return defs;
  }

  function appendRouteGradient(defs, id, source, target) {
    const ns = 'http://www.w3.org/2000/svg';
    const gradient = document.createElementNS(ns, 'linearGradient');
    gradient.setAttribute('id', id);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradient.setAttribute('x1', String(source.x));
    gradient.setAttribute('y1', String(source.y));
    gradient.setAttribute('x2', String(target.x));
    gradient.setAttribute('y2', String(target.y));
    [
      ['0%', '#d8d0c4', '0.015'],
      ['58%', '#d8d0c4', '0.055'],
      ['84%', '#d8d0c4', '0.12'],
      ['100%', '#d8d0c4', '0.23']
    ].forEach(([offset, color, opacity]) => {
      const stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      stop.setAttribute('stop-opacity', opacity);
      gradient.append(stop);
    });
    defs.append(gradient);
  }

  function draw() {
    overlay.replaceChildren();
    grid.querySelectorAll('.palace').forEach((node) => {
      node.classList.remove('is-source', 'is-trine', 'is-opposite');
      node.setAttribute('aria-pressed', 'false');
    });
    const source = /** @type {HTMLElement} */ (grid.querySelector(`[data-slot="${selectedSlot}"]`));
    if (!source) return;
    source.classList.add('is-source');
    source.setAttribute('aria-pressed', 'true');
    const targetSlots = engine.getTrineSlots(selectedSlot);
    const gridRect = grid.getBoundingClientRect();
    const centerRect = /** @type {HTMLElement} */ (grid.querySelector('.center')).getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${gridRect.width} ${gridRect.height}`);
    const defs = appendDefinitions();
    const sRect = source.getBoundingClientRect();
    targetSlots.forEach((slot, index) => {
      const target = /** @type {HTMLElement} */ (grid.querySelector(`[data-slot="${slot}"]`));
      target.classList.add(index === 1 ? 'is-opposite' : 'is-trine');
      const route = router.route(sRect, target.getBoundingClientRect(), centerRect, gridRect, index, {
        baseInset: 10,
        laneSpacing: 8,
        fanSpacing: 10,
        cornerRadius: 10,
        protectedInset: 24
      });
      const gradientId = `demo-route-${index}`;
      appendRouteGradient(defs, gradientId, route.points[0], route.points[route.points.length - 1]);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', route.d);
      path.setAttribute('class', 'relationship-path');
      path.setAttribute('stroke', `url(#${gradientId})`);
      path.setAttribute('marker-end', 'url(#demo-arrow)');
      path.setAttribute('data-route', 'inner-rail-subtle');
      path.setAttribute('data-source-side', route.sourceSide);
      path.setAttribute('data-target-side', route.targetSide);
      overlay.append(path);
    });
    const sourcePalace = palaces.find((item) => item.slotId === selectedSlot);
    const targetPalaces = targetSlots.map((slot) => palaces.find((item) => item.slotId === slot));
    readout.innerHTML = `<b>三方四正 [${LAYERS[activeLayer]}]</b><span class="source">本宮 ${sourcePalace.label}</span><span>→</span><span class="target">三方 ${targetPalaces[0].label}</span><span class="opposite">對宮 ${targetPalaces[1].label}</span><span class="target">三方 ${targetPalaces[2].label}</span>`;
    status.textContent = `${sourcePalace.label} → ${targetPalaces.map((item) => item.label).join(' · ')}`;
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('.palace');
    if (!button) return;
    selectedSlot = button.dataset.slot;
    draw();
  });

  document.querySelector('.layer-bar').addEventListener('click', (event) => {
    const button = event.target.closest('[data-layer]');
    if (!button) return;
    activeLayer = button.dataset.layer;
    document.querySelectorAll('[data-layer]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    renderGrid();
    draw();
  });

  window.addEventListener('resize', draw, { passive: true });
  renderGrid();
  draw();
})();
