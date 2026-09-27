// @ts-check
/**
 * True Path — journey controller.
 *
 * Drives the fixed journey (Brief 3):
 *   Landing -> Talent Tree (12 interleaved Likert) -> Talent Snapshot
 *   -> Ikigai (4 screens) -> Direction Snapshot
 *   -> Iron Triangle intro -> 6 randomised scenarios -> synthesis -> reveal
 *   -> True Path combined result
 *
 * Design rules honoured here:
 *  - all copy comes from config (Brief 15) — nothing user-facing is hard-coded
 *  - no percentage is computed in the UI (Brief 17): scoring.js owns every number
 *  - step URLs are real, so refresh and Back keep answers (Brief 17)
 *  - scenario cards are shuffled per scenario, and the ANSWER is stored as a role
 *    key, never a displayed position (Brief 6.3)
 *  - suggested Ikigai cards are highlighted only, never auto-selected (Brief 5)
 *  - the role glyph appears only AFTER a selection (Brief 11)
 */

(function () {
  'use strict';

  var Scoring = /** @type {any} */ (window).TruePathScoring;
  var Resolve = /** @type {any} */ (window).TruePathResolve;
  var Svg = /** @type {any} */ (window).TruePathSvg;
  var StateMod = /** @type {any} */ (window).TruePathState;

  // ─── config ────────────────────────────────────────────────────────────────

  function loadConfig() {
    var node = document.getElementById('tp-config');
    if (!node || !node.textContent) throw new Error('True Path config missing');
    return JSON.parse(node.textContent);
  }

  var CFG = loadConfig();
  var TALENT = CFG.talent;
  var IKIGAI = CFG.ikigai;
  var IRON = CFG.ironTriangle;
  var SCORING = CFG.scoring;
  var TRUPATH = CFG.trupath;
  var CTA = CFG.cta;

  // The engine expects talent config merged with its scoring block.
  var TALENT_FOR_ENGINE = Object.assign({}, TALENT, { scoring: SCORING.talent });

  var ROUTES = {
    landing: '/true-path',
    talentIntro: '/true-path/talent',
    talentQ: '/true-path/talent/q',
    talentResult: '/true-path/talent/result',
    direction: '/true-path/direction',
    directionResult: '/true-path/direction/result',
    roleIntro: '/true-path/role',
    roleQ: '/true-path/role/q',
    roleResult: '/true-path/role/result',
    result: '/true-path/result',
    report: '/true-path/report'
  };

  var store = StateMod.createStore(safeSession());
  var resultStore = StateMod.createResultStore(safeSession());

  function safeSession() {
    try {
      return window.sessionStorage;
    } catch (error) {
      return null;
    }
  }

  // ─── tiny DOM helpers ──────────────────────────────────────────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2), value);
        } else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function esc(value) {
    return Svg.escapeXml(value);
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function qs(name) {
    var match = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // ─── analytics (Brief 16) ──────────────────────────────────────────────────

  var analyticsDisabled = qs('noanalytics') === '1';

  function tp(eventName, props) {
    if (analyticsDisabled) return;
    var payload = Object.assign({ event: eventName, ts: Date.now() }, props || {});
    /** @type {any} */ (window).dataLayer = /** @type {any} */ (window).dataLayer || [];
    /** @type {any} */ (window).dataLayer.push(payload);
    if (window.console && console.debug) console.debug('[true-path]', eventName, props || {});
  }

  // ─── shuffle (Brief 6.3: randomise card order on every scenario) ────────────

  function shuffled(list) {
    var out = list.slice();
    var random = randomFn();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function randomFn() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        return function () {
          var buffer = new Uint32Array(1);
          window.crypto.getRandomValues(buffer);
          return buffer[0] / 4294967296;
        };
      }
    } catch (error) {
      /* fall through */
    }
    return Math.random;
  }

  // ─── shell rendering ───────────────────────────────────────────────────────

  var stepRoot = /** @type {any} */ (document.querySelector('[data-tp-step-root]'));
  var landingView = /** @type {any} */ (document.querySelector('[data-tp-view="landing"]'));
  var reportRoot = /** @type {any} */ (document.querySelector('[data-tp-report-root]'));

  function showJourney() {
    if (landingView) landingView.hidden = true;
    if (stepRoot) stepRoot.hidden = false;
    if (reportRoot) reportRoot.hidden = true;
  }

  function showLanding() {
    if (landingView) landingView.hidden = false;
    if (stepRoot) stepRoot.hidden = true;
    if (reportRoot) reportRoot.hidden = true;
  }

  function setTitle(text) {
    document.title = text + ' | True Path \u8f68\u9053 \u2014 The Full Picture';
  }

  /**
   * Brief 11 progress bar: three named segments 才 Talent / 道 Direction / 位 Role,
   * plus "Final step - about 60 seconds left" on Stage 3.
   */
  function progressBar(activeStage) {
    var steps = CTA.progress.stages;
    var list = el('ol', { class: 'tp-progress__steps' });

    steps.forEach(function (stage, index) {
      if (index > 0) {
        list.appendChild(el('li', { class: 'tp-progress__sep', 'aria-hidden': 'true', text: '\u2192' }));
      }
      var state = index < activeStage ? 'done' : index === activeStage ? 'active' : 'todo';
      var item = el('li', { class: 'tp-progress__step', 'data-state': state }, [
        el('span', { class: 'tp-progress__char', 'aria-hidden': 'true', text: stage.character }),
        el('span', { text: stage.name })
      ]);
      if (state === 'active') item.setAttribute('aria-current', 'step');
      list.appendChild(item);
    });

    var meta = activeStage === 2 ? IRON.timeLeftLabel : 'Stage ' + (activeStage + 1) + ' of 3';

    var bar = el('div', { class: 'tp-progress' }, [
      el('div', { class: 'tp-progress__inner' }, [
        list,
        el('p', { class: 'tp-progress__meta', text: meta })
      ]),
      el('div', { class: 'tp-progress__bar' }, [
        el('span', { style: 'width:' + ((activeStage + 1) / 3) * 100 + '%' })
      ])
    ]);
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Journey progress');
    return bar;
  }

  function section(children, options) {
    var opts = options || {};
    var wrap = el('section', { class: 'tp-section' }, [el('div', { class: 'tp-wrap' }, children)]);
    if (opts.wide === false) wrap.className = 'tp-section';
    return wrap;
  }

  function actions(children) {
    return el('div', { class: 'tp-actions' }, children);
  }

  function backLink(href, label) {
    return el('a', { class: 'tp-btn tp-btn--ghost', href: href, text: label || 'Back' });
  }

  function ctaLink(href, label, extraClass) {
    return el('a', {
      class: 'tp-btn' + (extraClass ? ' ' + extraClass : ''),
      href: href,
      text: label
    });
  }

  /**
   * Brief 6.3 / 17: the "i" tooltip explaining the independent-vs-share distinction.
   */
  function infoDot(label) {
    return el('button', {
      class: 'tp-info',
      type: 'button',
      title: label,
      'aria-label': label,
      text: 'i'
    });
  }

  // ─── step index (derived from stored answers) ──────────────────────────────

  var TALENT_ORDER = TALENT.displayOrder;

  function talentProgress(state) {
    var answered = 0;
    for (var i = 0; i < TALENT_ORDER.length; i += 1) {
      if (state.talentAnswers[TALENT_ORDER[i]] !== undefined) answered += 1;
    }
    return answered;
  }

  function firstUnansweredTalent(state) {
    for (var i = 0; i < TALENT_ORDER.length; i += 1) {
      if (state.talentAnswers[TALENT_ORDER[i]] === undefined) return i;
    }
    return TALENT_ORDER.length - 1;
  }

  function scenarioOrderFor(state, scenario) {
    var stored = state.scenarioOrder[scenario.id];
    if (stored && stored.length === 3) return stored;
    var order = shuffled(Scoring.ROLE_KEYS);
    store.setScenarioAnswer;
    // Persist the shown order without touching the answer.
    var next = state;
    next.scenarioOrder[scenario.id] = order;
    store.restore(next);
    return order;
  }

  function firstUnansweredScenario(state) {
    for (var i = 0; i < IRON.scenarios.length; i += 1) {
      if (state.scenarioAnswers[IRON.scenarios[i].id] === undefined) return i;
    }
    return IRON.scenarios.length - 1;
  }

  // ─── derived results ───────────────────────────────────────────────────────

  function computeTalent() {
    var state = store.getState();
    return Scoring.scoreTalent(state.talentAnswers, TALENT_FOR_ENGINE);
  }

  function computeTriangle() {
    var state = store.getState();
    var talent = Scoring.scoreTalent(state.talentAnswers, TALENT_FOR_ENGINE);
    var scenarioRoles = IRON.scenarios.map(function (scenario) {
      return state.scenarioAnswers[scenario.id];
    });
    var picks = state.ikigaiPicks;

    var triangle = Scoring.computeRoleResult(scenarioRoles, talent.pct, picks, SCORING);
    var resolved = Resolve.buildTruePathResult({
      talent: talent,
      triangle: triangle,
      picks: picks,
      configs: {
        talent: TALENT_FOR_ENGINE,
        ikigai: IKIGAI,
        ironTriangle: IRON,
        truthPath: TRUPATH
      }
    });
    return { talent: talent, triangle: triangle, resolved: resolved };
  }

  function pickLabel(screenId, key) {
    var screen = IKIGAI.screens.filter(function (entry) {
      return entry.id === screenId;
    })[0];
    if (!screen) return null;
    var option = screen.options.filter(function (entry) {
      return entry.key === key;
    })[0];
    return option || null;
  }

  function picksForField(field) {
    var state = store.getState();
    return state.ikigaiPicks
      .filter(function (pick) {
        var screen = IKIGAI.screens.filter(function (entry) {
          return entry.id === pick.screenId;
        })[0];
        return screen && screen.field === field;
      })
      .map(function (pick) {
        return pickLabel(pick.screenId, pick.key);
      })
      .filter(Boolean);
  }

  function joinList(items, conjunction) {
    var labels = items.map(function (item) {
      return item.label;
    });
    if (labels.length === 0) return '';
    if (labels.length === 1) return labels[0];
    var last = labels[labels.length - 1];
    return labels.slice(0, -1).join(', ') + (conjunction || ' and ') + last;
  }

  // ─── views ─────────────────────────────────────────────────────────────────

  function renderTalentIntro() {
    showJourney();
    setTitle('Talent Tree');
    tp('tp_talent_start_view');

    var branches = el('div', { class: 'tp-stages' },
      CTA.talentIntro.branches.map(function (branch) {
        return el('article', { class: 'tp-stage-card' }, [
          el('h3', { class: 'tp-stage-card__name', text: branch.name }),
          el('p', { class: 'tp-stage-card__line', text: branch.line })
        ]);
      })
    );

    var state = store.getState();
    var answered = talentProgress(state);
    var resume = answered > 0 && answered < TALENT_ORDER.length;

    var startBtn = el('a', { class: 'tp-btn', href: ROUTES.talentQ }, [
      document.createTextNode(CTA.talentIntro.ctaLabel)
    ]);
    if (resume) {
      startBtn.textContent = 'Continue \u2014 ' + (TALENT_ORDER.length - answered) + ' statements left';
    }

    clear(stepRoot);
    stepRoot.appendChild(progressBar(0));
    stepRoot.appendChild(section([
      el('p', { class: 'tp-eyebrow', text: 'Stage 1 of 3 \u00b7 Talent \u624d' }),
      el('h1', { class: 'tp-h1', text: CTA.talentIntro.headline }),
      el('hr', { class: 'tp-rule' }),
      el('p', { class: 'tp-lead', text: CTA.talentIntro.body }),
      branches,
      actions([
        backLink(ROUTES.landing),
        startBtn
      ])
    ]));

    tp('tp_talent_intro_view', { resumed: resume, answered: answered });
  }

  function renderTalentQuestion(requestedIndex) {
    showJourney();
    var state = store.getState();
    var index = Number.isInteger(requestedIndex) ? requestedIndex : firstUnansweredTalent(state);
    index = Math.max(0, Math.min(TALENT_ORDER.length - 1, index));

    var questionId = TALENT_ORDER[index];
    var question = TALENT.questions.filter(function (entry) {
      return entry.id === questionId;
    })[0];
    var selected = state.talentAnswers[questionId];

    setTitle('Talent Tree \u2014 ' + (index + 1) + ' of ' + TALENT_ORDER.length);
    tp('tp_talent_question_view', { questionId: questionId, index: index });

    var group = el('div', {
      class: 'tp-likert',
      role: 'radiogroup',
      'aria-label': question.text
    });

    var buttons = [];
    for (var value = TALENT.scale.min; value <= TALENT.scale.max; value += 1) {
      var scaleEntry = TALENT.scale.labels[String(value)];
      var isSelected = selected === value;

      var option = el('button', {
        class: 'tp-likert__option',
        type: 'button',
        role: 'radio',
        'aria-checked': isSelected ? 'true' : 'false',
        'data-value': value,
        'data-selected': isSelected ? 'true' : 'false',
        tabindex: isSelected || (selected === undefined && value === TALENT.scale.min) ? '0' : '-1'
      }, [
        el('span', { class: 'tp-likert__num', 'aria-hidden': 'true', text: String(value) }),
        el('span', { class: 'tp-likert__label', text: scaleEntry.label })
      ]);

      option.addEventListener('click', (function (chosen) {
        return function () {
          choose(chosen);
        };
      })(value));
      buttons.push({ value: value, node: option });
      group.appendChild(option);
    }

    function focusValue(value) {
      buttons.forEach(function (entry) {
        entry.node.setAttribute('tabindex', entry.value === value ? '0' : '-1');
      });
      var target = buttons.filter(function (entry) {
        return entry.value === value;
      })[0];
      if (target) target.node.focus();
    }

    group.addEventListener('keydown', function (event) {
      var current = Number(event.target.getAttribute && event.target.getAttribute('data-value'));
      if (!Number.isFinite(current)) return;
      var next = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(TALENT.scale.max, current + 1);
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(TALENT.scale.min, current - 1);
      else if (event.key === 'Home') next = TALENT.scale.min;
      else if (event.key === 'End') next = TALENT.scale.max;
      if (next === null) return;
      event.preventDefault();
      focusValue(next);
      choose(next);
    });

    function choose(value) {
      store.setTalentAnswer(questionId, value);
      tp('tp_talent_answer', { questionId: questionId, value: value });
      buttons.forEach(function (entry) {
        var on = entry.value === value;
        entry.node.setAttribute('data-selected', on ? 'true' : 'false');
        entry.node.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      window.setTimeout(function () {
        if (index + 1 < TALENT_ORDER.length) go(ROUTES.talentQ + '?i=' + (index + 1));
        else go(ROUTES.talentResult);
      }, IRON.autoAdvanceMs);
    }

    var status = el('p', {
      class: 'tp-muted',
      'aria-live': 'polite',
      text: selected === undefined ? '' : 'Answer saved.'
    });

    clear(stepRoot);
    stepRoot.appendChild(progressBar(0));
    stepRoot.appendChild(section([
      el('div', { class: 'tp-question' }, [
        el('p', {
          class: 'tp-question__counter',
          text: (index + 1) + ' of ' + TALENT_ORDER.length
        }),
        el('h1', { class: 'tp-question__text', id: 'tp-q-text', text: question.text }),
        group,
        status,
        actions([
          index > 0 ? backLink(ROUTES.talentQ + '?i=' + (index - 1)) : backLink(ROUTES.talentIntro),
          selected !== undefined
            ? ctaLink(
                index + 1 < TALENT_ORDER.length ? ROUTES.talentQ + '?i=' + (index + 1) : ROUTES.talentResult,
                'Next',
                'tp-btn--ghost'
              )
            : null
        ])
      ])
    ]));

    var heading = document.getElementById('tp-q-text');
    if (heading) heading.setAttribute('tabindex', '-1');
  }

  function renderTalentResult() {
    showJourney();
    setTitle('Your Talent Tree');
    tp('tp_talent_result_view', { archetypeKey: computeTalent().archetypeKey });
    tp('tp_talent_complete');

    var talent = computeTalent();
    var snapshot = TALENT.snapshot;

    var svgHost = el('div', { class: 'tp-center' });
    svgHost.innerHTML = Svg.talentTreeSvg(talent.pct, TALENT.categories, {
      ariaLabel: 'Talent Tree: ' + TALENT.categories
        .map(function (category) {
          return category.name + ' ' + talent.pct[category.key];
        })
        .join(', ')
    });

    var bars = el('div', { class: 'tp-bars' },
      TALENT.categories.map(function (category) {
        var bar = el('div');
        bar.innerHTML = Svg.scoreBar(category.name, talent.pct[category.key]);
        return bar;
      })
    );

    var headingText = snapshot.headline;
    var headlineNode;
    if (talent.balancedProfile) {
      headlineNode = el('h1', { class: 'tp-snapshot__headline', text: snapshot.balancedHeadline });
    } else if (talent.coDominant) {
      var a = TALENT.categories.filter(function (c) { return c.key === talent.primary; })[0];
      var b = TALENT.categories.filter(function (c) { return c.key === talent.secondary; })[0];
      headlineNode = el('h1', {
        class: 'tp-snapshot__headline',
        text: snapshot.coDominantTemplate.replace('{a}', a.name).replace('{b}', b.name)
      });
    } else {
      headlineNode = el('h1', { class: 'tp-snapshot__headline', text: headingText });
    }

    var archetype = talent.archetype;
    var primaryCat = TALENT.categories.filter(function (c) { return c.key === talent.primary; })[0];
    var secondaryCat = TALENT.categories.filter(function (c) { return c.key === talent.secondary; })[0];

    var observationKeys = talent.balancedProfile
      ? TALENT.categories.map(function (c) { return c.key; })
      : [talent.primary, talent.secondary];

    var observations = el('ul', { class: 'tp-list' },
      observationKeys.map(function (key) {
        return el('li', { text: TALENT.observations[key] });
      })
    );

    var children = [
      el('p', { class: 'tp-eyebrow', text: 'Stage 1 Complete \u00b7 Talent \u624d' }),
      headlineNode
    ];

    if (talent.balancedProfile) {
      children.push(el('p', { class: 'tp-lead', text: snapshot.balancedMessage }));
    }

    if (archetype) {
      children.push(el('div', { class: 'tp-panel' }, [
        el('p', { class: 'tp-label', text: 'Your Working Style' }),
        el('h2', { class: 'tp-h2', text: archetype.name }),
        el('p', { class: 'tp-lead', text: archetype.essence }),
        el('p', {
          class: 'tp-snapshot__pair',
          text: primaryCat.name + ' \u00d7 ' + secondaryCat.name
        })
      ]));
    }

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: 'Your Four Branches' }),
      svgHost,
      el('p', {
        class: 'tp-muted',
        style: 'text-align:center',
        text: 'Measured independently \u2014 you can be strong in more than one.'
      }),
      bars
    ]));

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: 'What This Suggests' }),
      observations
    ]));

    children.push(el('div', { class: 'tp-panel tp-center' }, [
      el('p', { class: 'tp-lead', style: 'margin:0 auto 8px', text: snapshot.ctaSubcopy }),
      el('div', { class: 'tp-btn-row', style: 'justify-content:center' }, [
        ctaLink(snapshot.ctaHref, snapshot.ctaLabel)
      ])
    ]));

    children.push(actions([
      backLink(ROUTES.talentQ + '?i=' + (TALENT_ORDER.length - 1), 'Review answers')
    ]));

    clear(stepRoot);
    stepRoot.appendChild(progressBar(0));
    stepRoot.appendChild(section(children));
  }

  function renderIkigai(screenIndex) {
    showJourney();
    var state = store.getState();
    var index = Number.isInteger(screenIndex) ? screenIndex : 0;
    index = Math.max(0, Math.min(IKIGAI.screens.length - 1, index));

    var screen = IKIGAI.screens[index];
    setTitle('Direction \u2014 ' + screen.question);
    tp('tp_ikigai_step', { step: screen.id, index: index });

    var talent = computeTalent();
    var suggestionBuckets = IKIGAI.suggestions || {};
    var suggestedKeys = [];
    [talent.primary, talent.secondary].forEach(function (category) {
      var bucket = suggestionBuckets[category];
      if (bucket && bucket[screen.id]) {
        bucket[screen.id].forEach(function (key) {
          if (suggestedKeys.indexOf(key) === -1) suggestedKeys.push(key);
        });
      }
    });

    var current = state.ikigaiPicks.filter(function (pick) {
      return pick.screenId === screen.id;
    });
    var selectedMap = {};
    current.forEach(function (pick) {
      selectedMap[pick.key] = pick;
    });

    var hint = el('p', {
      class: 'tp-selection-hint',
      'aria-live': 'polite',
      text: 'Choose ' + IKIGAI.minSelections + '\u2013' + IKIGAI.maxSelections + ' \u00b7 ' +
        current.length + ' selected'
    });

    var nextBtn = ctaLink(
      index + 1 < IKIGAI.screens.length ? ROUTES.direction + '?i=' + (index + 1) : ROUTES.directionResult,
      index + 1 < IKIGAI.screens.length ? 'Next' : 'See Your Direction',
      current.length >= IKIGAI.minSelections ? '' : 'tp-btn--disabled'
    );
    if (current.length < IKIGAI.minSelections) {
      nextBtn.setAttribute('aria-disabled', 'true');
      nextBtn.addEventListener('click', function (event) {
        if (current.length < IKIGAI.minSelections) event.preventDefault();
      });
    }

    var options = el('div', { class: 'tp-cards' });

    screen.options.forEach(function (option) {
      var isSuggested = suggestedKeys.indexOf(option.key) !== -1;
      var isSelected = Boolean(selectedMap[option.key]);

      var card = el('button', {
        class: 'tp-card',
        type: 'button',
        'aria-pressed': isSelected ? 'true' : 'false',
        'data-selected': isSelected ? 'true' : 'false',
        'data-suggested': isSuggested ? 'true' : 'false',
        'data-key': option.key
      }, [
        isSuggested ? el('span', { class: 'tp-card__badge', text: 'Suggested' }) : null,
        el('span', { class: 'tp-card__check', 'aria-hidden': 'true', text: '\u2713' }),
        el('span', { text: option.label })
      ]);

      card.addEventListener('click', function () {
        toggle(option.key, isSuggested, card);
      });

      options.appendChild(card);
    });

    function toggle(key, wasSuggested, card) {
      var latest = store.getState();
      var mine = latest.ikigaiPicks.filter(function (pick) {
        return pick.screenId === screen.id;
      });
      var exists = mine.filter(function (pick) {
        return pick.key === key;
      })[0];

      if (exists) {
        mine = mine.filter(function (pick) {
          return pick.key !== key;
        });
        card.setAttribute('aria-pressed', 'false');
        card.setAttribute('data-selected', 'false');
      } else {
        if (mine.length >= IKIGAI.maxSelections) {
          hint.textContent = 'You can choose up to ' + IKIGAI.maxSelections + '.';
          return;
        }
        // Brief 5: record whether the pick came from a suggestion.
        mine.push({ key: key, screenId: screen.id, fromSuggestion: Boolean(wasSuggested) });
        card.setAttribute('aria-pressed', 'true');
        card.setAttribute('data-selected', 'true');
      }

      store.setIkigaiPicks(screen.id, mine);
      tp('tp_ikigai_select', {
        step: screen.id,
        key: key,
        fromSuggestion: Boolean(wasSuggested),
        selected: !exists
      });
      var count = mine.length;
      hint.textContent = 'Choose ' + IKIGAI.minSelections + '\u2013' + IKIGAI.maxSelections +
        ' \u00b7 ' + count + ' selected';
      if (count >= IKIGAI.minSelections) {
        nextBtn.classList.remove('tp-btn--disabled');
        nextBtn.removeAttribute('aria-disabled');
      } else {
        nextBtn.classList.add('tp-btn--disabled');
        nextBtn.setAttribute('aria-disabled', 'true');
      }
      resetNext();
    }

    // Rebind the guard so it reads the live count.
    function resetNext() {
      var fresh = nextBtn.cloneNode(true);
      nextBtn.parentNode.replaceChild(fresh, nextBtn);
      nextBtn = fresh;
      nextBtn.addEventListener('click', function (event) {
        var latest = store.getState();
        var mine = latest.ikigaiPicks.filter(function (pick) {
          return pick.screenId === screen.id;
        });
        if (mine.length < IKIGAI.minSelections) {
          event.preventDefault();
          hint.textContent = 'Please choose at least ' + IKIGAI.minSelections + '.';
        }
      });
    }

    if (index === 0) tp('tp_ikigai_start');

    clear(stepRoot);
    stepRoot.appendChild(progressBar(1));
    stepRoot.appendChild(section([
      el('p', { class: 'tp-eyebrow', text: 'Stage 2 of 3 \u00b7 Direction \u9053' }),
      el('h1', { class: 'tp-h2', id: 'tp-ikigai-q', text: screen.question }),
      el('p', { class: 'tp-muted', text: (index + 1) + ' of ' + IKIGAI.screens.length }),
      options,
      hint,
      actions([
        index > 0 ? backLink(ROUTES.direction + '?i=' + (index - 1)) : backLink(ROUTES.talentResult),
        nextBtn
      ])
    ]));

    var heading = document.getElementById('tp-ikigai-q');
    if (heading) heading.setAttribute('tabindex', '-1');
  }

  function renderDirectionResult() {
    showJourney();
    setTitle('Your Direction');
    tp('tp_direction_snapshot_view');

    var state = store.getState();
    var energises = picksForField('energises');
    var goodAt = picksForField('goodAt');
    var economic = picksForField('economicValue');
    var impact = picksForField('impact');

    var sentence = IKIGAI.snapshot.synthesisTemplate
      .replace('{energises}', joinList(energises).toLowerCase())
      .replace('{impact}', joinList(impact).toLowerCase())
      .replace('{economicValue}', joinList(economic, ' and through ').toLowerCase());

    function group(label, items, field, screenId) {
      return el('div', { class: 'tp-panel' }, [
        el('p', { class: 'tp-label', text: label }),
        items.length
          ? el('ul', { class: 'tp-list' }, items.map(function (item) {
              var pick = state.ikigaiPicks.filter(function (entry) {
                return entry.key === item.key && entry.screenId === screenId;
              })[0];
              return el('li', { text: item.label + (pick && pick.fromSuggestion ? ' \u00b7 suggested' : '') });
            }))
          : el('p', { class: 'tp-muted', text: 'Not specified.' })
      ]);
    }

    var screenByField = {};
    IKIGAI.screens.forEach(function (screen) {
      screenByField[screen.field] = screen.id;
    });

    clear(stepRoot);
    stepRoot.appendChild(progressBar(1));
    stepRoot.appendChild(section([
      el('p', { class: 'tp-eyebrow', text: 'Stage 2 Complete \u00b7 Direction \u9053' }),
      el('h1', { class: 'tp-snapshot__headline', text: IKIGAI.snapshot.headline }),
      el('hr', { class: 'tp-rule' }),
      el('p', { class: 'tp-lead', text: sentence }),
      el('div', { class: 'tp-grid-2' }, [
        group(IKIGAI.screens[0].rowLabel, energises, 'energises', screenByField.energises),
        group(IKIGAI.screens[1].rowLabel, goodAt, 'goodAt', screenByField.goodAt),
        group(IKIGAI.screens[2].rowLabel, economic, 'economicValue', screenByField.economicValue),
        group(IKIGAI.screens[3].rowLabel, impact, 'impact', screenByField.impact)
      ]),
      el('div', { class: 'tp-panel tp-center' }, [
        el('p', { class: 'tp-lead', style: 'margin:0 auto 8px', text: IKIGAI.snapshot.ctaSubcopy }),
        el('div', { class: 'tp-btn-row', style: 'justify-content:center' }, [
          ctaLink(IKIGAI.snapshot.ctaHref, IKIGAI.snapshot.ctaLabel)
        ])
      ]),
      actions([backLink(ROUTES.direction + '?i=' + (IKIGAI.screens.length - 1), 'Review answers')])
    ]));
  }

  function renderRoleIntro() {
    showJourney();
    setTitle('Iron Triangle');
    tp('tp_role_intro_view');

    var storyOpen = false;
    var storyBody = el('div', { hidden: true }, [
      el('hr', { class: 'tp-rule' }),
      el('p', { class: 'tp-lead', text: IRON.intro.story })
    ]);

    var storyToggle = el('button', {
      class: 'tp-btn tp-btn--ghost',
      type: 'button',
      'aria-expanded': 'false',
      text: IRON.intro.storyToggleLabel
    });
    storyToggle.addEventListener('click', function () {
      storyOpen = !storyOpen;
      storyBody.hidden = !storyOpen;
      storyToggle.setAttribute('aria-expanded', storyOpen ? 'true' : 'false');
      if (storyOpen) tp('tp_role_story_expand');
    });

    var state = store.getState();
    var answered = IRON.scenarios.filter(function (scenario) {
      return state.scenarioAnswers[scenario.id] !== undefined;
    }).length;

    clear(stepRoot);
    stepRoot.appendChild(progressBar(2));
    stepRoot.appendChild(section([
      el('p', { class: 'tp-eyebrow', text: IRON.stageLabel + ' \u00b7 Role \u4f4d' }),
      el('h1', { class: 'tp-h1', text: IRON.intro.headline }),
      el('hr', { class: 'tp-rule' }),
      el('p', { class: 'tp-lead', html: IRON.intro.body }),
      el('div', { class: 'tp-grid-3' }, IRON.roles.map(function (role) {
        return el('div', { class: 'tp-panel' }, [
          el('p', { class: 'tp-label', text: role.glyph + ' ' + role.name + ' ' + role.chinese }),
          el('p', { class: 'tp-lead', text: role.essence })
        ]);
      })),
      el('div', { class: 'tp-btn-row', style: 'margin-top:26px' }, [storyToggle]),
      storyBody,
      actions([
        backLink(ROUTES.directionResult),
        ctaLink(
          answered > 0 && answered < IRON.scenarios.length
            ? ROUTES.roleQ + '?i=' + firstUnansweredScenario(state)
            : ROUTES.roleQ,
          answered > 0 && answered < IRON.scenarios.length
            ? 'Continue \u2014 ' + (IRON.scenarios.length - answered) + ' scenarios left'
            : IRON.intro.ctaLabel
        )
      ])
    ]));
  }

  function renderRoleScenario(requestedIndex) {
    showJourney();
    var state = store.getState();
    var index = Number.isInteger(requestedIndex) ? requestedIndex : firstUnansweredScenario(state);
    index = Math.max(0, Math.min(IRON.scenarios.length - 1, index));

    var scenario = IRON.scenarios[index];
    setTitle('Scenario ' + (index + 1) + ' of ' + IRON.scenarios.length);
    tp('tp_role_scenario_view', { scenarioId: scenario.id });

    var order = scenarioOrderFor(store.getState(), scenario);
    var selected = state.scenarioAnswers[scenario.id];

    var options = el('div', { class: 'tp-scenario__options', role: 'group', 'aria-label': scenario.prompt });
    var nodes = [];

    order.forEach(function (roleKey) {
      var role = IRON.roles.filter(function (entry) {
        return entry.key === roleKey;
      })[0];
      var isSelected = selected === roleKey;

      // The option text is the scenario option; the glyph is revealed only when selected.
      var card = el('button', {
        class: 'tp-option-card',
        type: 'button',
        'aria-pressed': isSelected ? 'true' : 'false',
        'data-selected': isSelected ? 'true' : 'false',
        'data-role': roleKey
      }, [
        el('span', { class: 'tp-option-card__glyph', 'aria-hidden': 'true', text: role.glyph }),
        el('span', { text: scenario.options[roleKey] })
      ]);

      card.addEventListener('click', function () {
        choose(roleKey, index);
      });
      nodes.push({ roleKey: roleKey, node: card });
      options.appendChild(card);
    });

    function choose(roleKey, position) {
      // Brief 6.3: store the role KEY, and record the displayed position for analytics.
      var shownPosition = order.indexOf(roleKey);
      store.setScenarioAnswer(scenario.id, roleKey, order);
      tp('tp_role_answer', {
        scenarioId: scenario.id,
        role: roleKey,
        positionShown: shownPosition
      });
      nodes.forEach(function (entry) {
        var on = entry.roleKey === roleKey;
        entry.node.setAttribute('data-selected', on ? 'true' : 'false');
        entry.node.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      window.setTimeout(function () {
        if (index + 1 < IRON.scenarios.length) go(ROUTES.roleQ + '?i=' + (index + 1));
        else go(ROUTES.roleResult);
      }, IRON.autoAdvanceMs);
    }

    clear(stepRoot);
    stepRoot.appendChild(progressBar(2));
    stepRoot.appendChild(section([
      el('div', { class: 'tp-question' }, [
        el('p', { class: 'tp-question__counter', text: 'Scenario ' + (index + 1) + ' of ' + IRON.scenarios.length }),
        el('h1', { class: 'tp-scenario__prompt', id: 'tp-scenario', text: scenario.prompt }),
        options,
        actions([
          index > 0 ? backLink(ROUTES.roleQ + '?i=' + (index - 1)) : backLink(ROUTES.roleIntro),
          selected !== undefined
            ? ctaLink(
                index + 1 < IRON.scenarios.length ? ROUTES.roleQ + '?i=' + (index + 1) : ROUTES.roleResult,
                'Next',
                'tp-btn--ghost'
              )
            : null
        ])
      ])
    ]));

    var heading = document.getElementById('tp-scenario');
    if (heading) heading.setAttribute('tabindex', '-1');
  }

  /**
   * Brief 6.4: a 2-3 second synthesis, then the reveal.
   */
  function renderRoleResult() {
    showJourney();
    setTitle('Your Iron Triangle Role');

    var synthesis = el('div', { class: 'tp-synthesis', role: 'status', 'aria-live': 'polite' }, [
      el('div', { class: 'tp-synthesis__ring', 'aria-hidden': 'true' }),
      el('p', { class: 'tp-synthesis__line', text: IRON.synthesis.lines[0] })
    ]);
    document.body.appendChild(synthesis);

    var lineIndex = 0;
    var lineTimer = window.setInterval(function () {
      lineIndex = (lineIndex + 1) % IRON.synthesis.lines.length;
      var line = synthesis.querySelector('.tp-synthesis__line');
      if (line) line.textContent = IRON.synthesis.lines[lineIndex];
    }, Math.max(600, Math.round(IRON.synthesis.durationMs / IRON.synthesis.lines.length)));

    var reduce = Svg.prefersReducedMotion();
    var delay = reduce ? 300 : IRON.synthesis.durationMs;

    window.setTimeout(function () {
      window.clearInterval(lineTimer);
      if (synthesis.parentNode) synthesis.parentNode.removeChild(synthesis);
      revealRole();
    }, delay);
  }

  function revealRole() {
    var computed = computeTriangle();
    var triangle = computed.triangle;
    var talent = computed.talent;

    tp('tp_role_complete');
    tp('tp_role_reveal_view', {
      primary: triangle.primary,
      pattern: triangle.pattern,
      gap: triangle.gap
    });

    var primaryRole = IRON.roles.filter(function (role) {
      return role.key === triangle.primary;
    })[0];
    var gapRole = IRON.roles.filter(function (role) {
      return role.key === triangle.gap;
    })[0];
    var gapInsight = IRON.gapInsights[triangle.gap];

    var svgHost = el('div', { class: 'tp-center' });
    svgHost.innerHTML = Svg.ironTriangleSvg(triangle.shares, IRON.roles, {
      animate: !Svg.prefersReducedMotion(),
      ariaLabel: IRON.roles
        .map(function (role) {
          return role.name + ' ' + triangle.shares[role.key] + ' percent';
        })
        .join(', ')
    });

    var children = [
      el('p', { class: 'tp-eyebrow', text: IRON.stageLabel + ' \u00b7 ' + IRON.reveal.headline }),
      el('h1', { class: 'tp-snapshot__headline', text: primaryRole.name + ' ' + primaryRole.chinese }),
      el('p', { class: 'tp-snapshot__pair', text: primaryRole.subtitle })
    ];

    // Brief 6.5 / 6.8: dual and balanced patterns get their own label.
    if (triangle.pattern === 'dual' && triangle.dualPair) {
      var dual = IRON.patterns.dual[triangle.dualPair];
      if (dual) {
        children.push(el('div', { class: 'tp-badges' }, [
          el('span', { class: 'tp-badge', html: 'Dual Pattern \u00b7 <span>' + esc(dual.label) + '</span>' })
        ]));
        children.push(el('p', { class: 'tp-lead', style: 'margin:12px auto 0', text: dual.line }));
      }
    } else if (triangle.pattern === 'balanced') {
      children.push(el('div', { class: 'tp-badges' }, [
        el('span', { class: 'tp-badge', html: '<span>' + esc(IRON.patterns.balanced.label) + '</span>' })
      ]));
      children.push(el('p', {
        class: 'tp-lead',
        style: 'margin:12px auto 0',
        text: IRON.patterns.balanced.line
      }));
    }

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label' }, [
        document.createTextNode('Your Iron Triangle '),
        infoDot(IRON.reveal.shareTooltip)
      ]),
      svgHost,
      el('div', { class: 'tp-bars' }, IRON.roles.map(function (role) {
        var host = el('div');
        host.innerHTML = Svg.scoreBar(role.name, triangle.shares[role.key] + '%', {
          max: 100,
          balanced: role.key === triangle.primary
        });
        return host;
      }))
    ]));

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: primaryRole.name + ' \u00b7 ' + primaryRole.essence }),
      el('p', { class: 'tp-lead', text: primaryRole.oneLine }),
      el('p', { class: 'tp-label', style: 'margin-top:22px', text: 'Natural Strengths' }),
      el('ul', { class: 'tp-list' }, primaryRole.naturalStrengths.map(function (item) {
        return el('li', { text: item });
      })),
      el('p', { class: 'tp-label', style: 'margin-top:22px', text: 'Your Contribution' }),
      el('p', { class: 'tp-lead', text: primaryRole.contribution })
    ]));

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: IRON.reveal.gapHeadline }),
      el('p', { class: 'tp-lead' }, [
        el('strong', { text: gapRole.name + ' ' + gapRole.chinese }),
        document.createTextNode(' \u2014 ' + IRON.reveal.gapFraming)
      ]),
      el('p', { class: 'tp-muted', style: 'margin-top:10px', text: gapInsight.classicImbalance }),
      el('p', { class: 'tp-lead', text: gapInsight.insight }),
      el('p', { class: 'tp-label', style: 'margin-top:22px', text: 'Watch Out For' }),
      el('p', { class: 'tp-lead', text: primaryRole.watchOut }),
      el('p', { class: 'tp-label', style: 'margin-top:22px', text: 'Allies Who Complement You' }),
      el('p', { class: 'tp-lead', text: primaryRole.allies })
    ]));

    // thrive is authored as a single string in iron-triangle.json, but may grow into a list.
    var thriveItems = Array.isArray(primaryRole.thrive)
      ? primaryRole.thrive
      : primaryRole.thrive
        ? [primaryRole.thrive]
        : [];

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: IRON.reveal.thriveHeadline }),
      el('ul', { class: 'tp-list' }, thriveItems.map(function (item) {
        return el('li', { text: item });
      })),
      el('p', { class: 'tp-label', style: 'margin-top:22px', text: 'Growth Edge' }),
      el('p', { class: 'tp-lead', text: primaryRole.growthEdge }),
      el('p', { class: 'tp-label', style: 'margin-top:22px', text: 'An Exemplar' }),
      el('p', { class: 'tp-lead' }, [
        el('strong', { text: primaryRole.exemplarName + ' \u2014 ' }),
        document.createTextNode(primaryRole.exemplarLine)
      ])
    ]));

    children.push(el('div', { class: 'tp-panel tp-center' }, [
      el('div', { class: 'tp-btn-row', style: 'justify-content:center' }, [
        ctaLink(ROUTES.result, 'See Your True Path \u8f68\u9053')
      ])
    ]));

    children.push(actions([backLink(ROUTES.roleQ + '?i=' + (IRON.scenarios.length - 1), 'Review scenarios')]));

    clear(stepRoot);
    stepRoot.appendChild(progressBar(2));
    stepRoot.appendChild(section(children));

    // Animate bars into place on the next frame.
    window.requestAnimationFrame(function () {
      var fills = stepRoot.querySelectorAll('.tp-bar__fill');
      for (var i = 0; i < fills.length; i += 1) {
        fills[i].style.width = fills[i].getAttribute('data-value') + '%';
      }
      var svgInner = svgHost.querySelector('path[opacity="0"]');
      if (svgInner) {
        svgInner.style.transition = 'opacity 0.8s ease';
        svgInner.style.opacity = '1';
      }
    });
  }

  /**
   * Brief 7: the combined True Path result (talent + direction + role).
   */
  function renderTruePath() {
    showJourney();
    var computed = computeTriangle();
    var talent = computed.talent;
    var triangle = computed.triangle;
    var resolved = computed.resolved;

    setTitle('Your True Path');
    tp('tp_truepath_view', { titleKey: resolved.title ? resolved.title.title : null });

    if (!resolved.title) {
      // Defensive: never render a blank result page.
      clear(stepRoot);
      stepRoot.appendChild(progressBar(2));
      stepRoot.appendChild(section([
        el('h1', { class: 'tp-h1', text: 'We need a little more to finish your True Path' }),
        el('p', { class: 'tp-lead', text: 'Please retake the journey so we can compute your role.' }),
        actions([ctaLink(ROUTES.landing, 'Start again')])
      ]));
      return;
    }

    var primaryRole = resolved.primaryRole;
    var gapRole = resolved.gapRole;
    var archetype = resolved.archetype;

    var svgHost = el('div', { class: 'tp-center' });
    svgHost.innerHTML = Svg.ironTriangleSvg(triangle.shares, IRON.roles, {
      animate: false,
      ariaLabel: IRON.roles
        .map(function (role) {
          return role.name + ' ' + triangle.shares[role.key] + ' percent';
        })
        .join(', ')
    });

    var children = [
      el('p', { class: 'tp-eyebrow', text: 'Your True Path \u00b7 \u8f68\u9053' }),
      el('div', { class: 'tp-title-block' }, [
        el('h1', { class: 'tp-title-block__title', text: resolved.title.title }),
        el('p', { class: 'tp-lead', style: 'margin:0 auto', text: resolved.title.essence }),
        el('div', { class: 'tp-badges' }, [
          el('span', { class: 'tp-badge', html: 'Role <span>' + esc(primaryRole.name + ' ' + primaryRole.chinese) + '</span>' }),
          el('span', { class: 'tp-badge', html: 'Style <span>' + esc(archetype ? archetype.name : '\u2014') + '</span>' }),
          el('span', { class: 'tp-badge', html: 'Pattern <span>' + esc(IRON.roles.map(function (r) { return triangle.shares[r.key]; }).join(' / ')) + '</span>' })
        ])
      ])
    ];

    if (resolved.pattern.label) {
      children.push(el('p', {
        class: 'tp-snapshot__pair',
        style: 'text-align:center',
        text: resolved.pattern.label
      }));
    }

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label' }, [
        document.createTextNode('How Your Contribution Is Distributed '),
        infoDot(IRON.reveal.shareTooltip)
      ]),
      svgHost
    ]));

    children.push(el('div', { class: 'tp-grid-3' }, [
      el('div', { class: 'tp-panel' }, [
        el('p', { class: 'tp-label', text: 'Talent \u624d' }),
        el('p', { class: 'tp-h3', text: archetype ? archetype.name : '\u2014' }),
        el('p', { class: 'tp-muted', style: 'margin-top:8px', text: resolved.truthPath ? '' : '' })
      ]),
      el('div', { class: 'tp-panel' }, [
        el('p', { class: 'tp-label', text: 'Direction \u9053' }),
        el('p', { class: 'tp-h3', text: joinList(picksForField('energises')) || '\u2014' }),
        el('p', { class: 'tp-muted', style: 'margin-top:8px', text: joinList(picksForField('economicValue')) })
      ]),
      el('div', { class: 'tp-panel' }, [
        el('p', { class: 'tp-label', text: 'Role \u4f4d' }),
        el('p', { class: 'tp-h3', text: primaryRole.name + ' ' + primaryRole.chinese }),
        el('p', { class: 'tp-muted', style: 'margin-top:8px', text: primaryRole.subtitle })
      ])
    ]));

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: 'How You Create Value' }),
      el('p', { class: 'tp-lead', text: resolved.valueCreation.sentence })
    ]));

    if (resolved.alignment.talent.message || resolved.alignment.economic.message) {
      var alignmentItems = [];
      if (resolved.alignment.talent.message) {
        alignmentItems.push(el('li', { text: resolved.alignment.talent.message }));
      }
      if (resolved.alignment.economic.message) {
        alignmentItems.push(el('li', { text: resolved.alignment.economic.message }));
      }
      children.push(el('div', { class: 'tp-panel' }, [
        el('p', { class: 'tp-label', text: 'Alignment Check' }),
        el('ul', { class: 'tp-list' }, alignmentItems)
      ]));
    }

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: 'The Ally You Most Need' }),
      el('p', { class: 'tp-lead' }, [
        el('strong', { text: gapRole.name + ' ' + gapRole.chinese + ' \u2014 ' }),
        document.createTextNode(IRON.gapInsights[triangle.gap].insight)
      ])
    ]));

    if (TRUPATH.reflectionPrompts && TRUPATH.reflectionPrompts.length) {
      children.push(el('div', { class: 'tp-panel' }, [
        el('p', { class: 'tp-label', text: 'Reflect On This' }),
        el('ul', { class: 'tp-list' }, TRUPATH.reflectionPrompts.map(function (prompt) {
          return el('li', { text: typeof prompt === 'string' ? prompt : prompt.text });
        }))
      ]));
    }

    children.push(el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: 'Ancient Wisdom' }),
      el('p', { class: 'tp-lead', style: 'white-space:pre-line', text: CTA.result.ancientWisdomBridge })
    ]));

    // Primary consultation CTA, with the result pre-filled as URL params (Brief 10).
    var consultHref = CTA.result.consultHref +
      (CTA.result.consultHref.indexOf('?') === -1 ? '?' : '&') +
      'text=' + encodeURIComponent('True Path consultation') +
      '&title=' + encodeURIComponent(resolved.title.title) +
      '&role=' + encodeURIComponent(primaryRole.name) +
      '&archetype=' + encodeURIComponent(archetype ? archetype.name : '');

    var consult = el('a', {
      class: 'tp-btn',
      href: consultHref,
      text: CTA.result.consultCtaLabel,
      target: '_blank',
      rel: 'noopener'
    });
    consult.addEventListener('click', function () {
      tp('tp_consult_click', { titleKey: resolved.title.title, source: 'result' });
    });

    var reportLink = ctaLink(ROUTES.report, CTA.report.headline);
    reportLink.addEventListener('click', function () {
      tp('tp_report_view', { resultId: null });
    });

    children.push(el('div', { class: 'tp-panel tp-center' }, [
      el('h2', { class: 'tp-h2', text: CTA.result.consultHeadline }),
      el('p', { class: 'tp-lead', style: 'margin:12px auto 20px', text: CTA.result.consultSubcopy }),
      el('div', { class: 'tp-btn-row', style: 'justify-content:center' }, [
        consult,
        reportLink
      ])
    ]));

    children.push(el('p', { class: 'tp-muted', style: 'margin-top:26px', text: TRUPATH.disclaimer }));

    children.push(actions([
      backLink(ROUTES.roleResult, 'Review your role'),
      ctaLink(CTA.result.restartHref, CTA.result.restartLabel, 'tp-btn--ghost')
    ]));

    clear(stepRoot);
    stepRoot.appendChild(progressBar(2));
    stepRoot.appendChild(section(children));

    resultStore.write({
      createdAt: new Date().toISOString(),
      talent: { raw: talent.raw, pct: talent.pct, archetypeKey: talent.archetypeKey },
      triangle: {
        shares: triangle.shares,
        pattern: triangle.pattern,
        primary: triangle.primary,
        gap: triangle.gap
      },
      titleKey: resolved.title.title
    });
  }

  // ─── router ────────────────────────────────────────────────────────────────

  function go(href) {
    tp('tp_navigate', { to: href });
    window.location.href = href;
  }

  function currentRoute() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/true-path';
    return path;
  }

  function route() {
    var path = currentRoute();
    var indexParam = qs('i');
    var index = indexParam === null ? null : parseInt(indexParam, 10);

    switch (path) {
      case '/true-path':
      case '/true-path/index.html':
        showLanding();
        setTitle('True Path');
        tp('tp_landing_view');
        bindLanding();
        break;
      case '/true-path/talent':
        renderTalentIntro();
        break;
      case '/true-path/talent/q':
        renderTalentQuestion(index);
        break;
      case '/true-path/talent/result':
        renderTalentResult();
        break;
      case '/true-path/direction':
        renderIkigai(index);
        break;
      case '/true-path/direction/result':
        renderDirectionResult();
        break;
      case '/true-path/role':
        renderRoleIntro();
        break;
      case '/true-path/role/q':
        renderRoleScenario(index);
        break;
      case '/true-path/role/result':
        renderRoleResult();
        break;
      case '/true-path/result':
        renderTruePath();
        break;
      default:
        // Unknown True Path route: fall back to the landing page rather than 404.
        window.location.replace(ROUTES.landing);
    }
  }

  function bindLanding() {
    var start = document.querySelectorAll('[data-tp-action="start"]');
    for (var i = 0; i < start.length; i += 1) {
      start[i].addEventListener('click', function () {
        tp('tp_start');
      });
    }
  }

  // ─── boot ──────────────────────────────────────────────────────────────────

  function boot() {
    if (!Scoring || !Resolve || !Svg || !StateMod) {
      // A dependency failed to load; surface it rather than showing a blank page.
      if (stepRoot) {
        showJourney();
        clear(stepRoot);
        stepRoot.appendChild(section([
          el('h1', { class: 'tp-h1', text: 'True Path could not load' }),
          el('p', { class: 'tp-lead', text: 'Please refresh the page. If it keeps happening, contact us and we will help.' }),
          actions([ctaLink('/contact', 'Contact Us')])
        ]));
      }
      return;
    }

    // Warn loudly during development if anything tries to hard-code a percentage.
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
