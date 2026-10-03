/**
 * True Path — canonical report integration tests.
 *
 * These lock the report/PDF layer to the APPROVED reference (the integration bundle's
 * `true-path.html` plus its `true-path.config.json`), where `tests/true-path-pdf.test.mjs` locks the
 * render pipeline itself. Four regressions motivated this suite, and each one shipped at least once:
 *
 *   1. Page 3 spilled the closing disclaimer onto a fourth page for realistic journeys, while
 *      `cta.report` promises a "3-Page True Path Report" in two places. The page count is therefore
 *      asserted across EVERY talent level and EVERY role, not just one convenient fixture.
 *   2. The gap block printed the retired classic imbalance framing in front of the approved `GAP`
 *      sentence. The canonical report shows `GAP[role]` alone.
 *   3. A legacy stored record ("creative_analyst", "helping_others_transform") must still resolve
 *      to the canonical content, without any canonical WRITE changing shape.
 *   4. A role field authored as an array must reach the page as readable text, not as a joined
 *      `a,b` blob and never as a raw snake_case key.
 *
 * pdfmake MUTATES the definition nodes handed to it, so a fresh record -> model -> definition is
 * built for every single render. Reusing one across renders silently corrupts the page count.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readTruePathConfig, readCanonicalConfig } from './helpers/true-path-config.mjs';

const require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const readJson = (relative) => readTruePathConfig(repoRoot, relative);

const ReportModel = require('../true-path/lib/report-model.js');
const ReportPdf = require('../true-path/lib/report-pdf.js');
const Svg = require('../true-path/assets/true-path-svg.js');
const Scoring = require('../true-path/lib/scoring.js');
const Resolve = require('../true-path/lib/trupath.js');
const pdfmake = require('pdfmake');

const talentJson = readJson('true-path/config/talent.json');
const ikigaiJson = readJson('true-path/config/ikigai.json');
const ironJson = readJson('true-path/config/iron-triangle.json');
const scoringJson = readJson('true-path/config/scoring.json');
const truthPathJson = readJson('true-path/config/trupath.json');
const ctaJson = readJson('true-path/config/cta.json');
const canonical = readCanonicalConfig(repoRoot);

const talentConfig = Object.assign({}, talentJson, { scoring: scoringJson.talent });
const fontPath = path.join(repoRoot, 'fonts', 'NotoSansSC.ttf');
const ROLES = ['commander', 'general', 'chancellor'];

/** Build a section 13 record for a journey shape. `per` = screen id -> how many options were picked. */
function recordFor(options) {
  const opts = options || {};
  const talentValue = opts.talentValue || 4;
  const role = opts.role || 'chancellor';
  const answers = {};
  talentJson.displayOrder.forEach((questionId) => {
    // `answersByCategory` lets a shape put different weight on each branch: the five-answer sweep
    // below needs a lone leader and a tie as well as a balanced profile, and a uniform answer can
    // only ever produce the balanced one.
    const category = (talentJson.questions.find((q) => q.id === questionId) || {}).category;
    const byCategory = opts.answersByCategory && opts.answersByCategory[category];
    answers[questionId] = byCategory !== undefined ? byCategory : talentValue;
  });
  const scenarioAnswers = {};
  ironJson.scenarios.forEach((scenario) => {
    scenarioAnswers[scenario.id] = role;
  });

  let picks = opts.picks;
  if (!picks) {
    const per = opts.per || { 'I-1': 1, 'I-2': 1, 'I-3': 1, 'I-4': 1 };
    picks = [];
    Object.keys(per).forEach((screenId) => {
      const screen = ikigaiJson.screens.find((s) => s.id === screenId);
      screen.options.slice(0, per[screenId]).forEach((option) => {
        picks.push({ screenId, key: option.key, fromSuggestion: true });
      });
    });
  }

  const talent = Scoring.scoreTalent(answers, talentConfig);
  const scenarioRoles = ironJson.scenarios.map((scenario) => scenarioAnswers[scenario.id]);
  const triangle = Scoring.computeRoleResult(scenarioRoles, talent.pct, picks, scoringJson);
  const resolved = Resolve.buildTruePathResult({
    talent,
    triangle,
    picks,
    configs: {
      talent: talentConfig,
      ikigai: ikigaiJson,
      ironTriangle: ironJson,
      truthPath: truthPathJson
    }
  });

  const record = ReportModel.buildResultRecord({
    talent,
    triangle,
    resolved,
    picks,
    suggestedKeys: ['solving_problems', 'planning', 'operations_management'],
    talentAnswers: answers,
    scenarios: ironJson.scenarios,
    scenarioAnswers,
    configs: { ikigai: ikigaiJson, scoring: scoringJson, truthPath: truthPathJson },
    meta: {
      resultId: opts.resultId || 'tp_canon0001',
      createdAt: '2026-09-24T10:00:00+08:00',
      attribution: { utm_source: null, utm_campaign: null, device: 'mobile' }
    }
  });

  // A legacy record stored a pre-rename key; the read path must still resolve it.
  if (opts.archetypeKey) record.talent.archetypeKey = opts.archetypeKey;
  return record;
}

function modelFor(record, overrides) {
  return ReportModel.buildReportModel(record, {
    talent: talentConfig,
    ikigai: (overrides && overrides.ikigai) || ikigaiJson,
    ironTriangle: (overrides && overrides.ironTriangle) || ironJson,
    truthPath: truthPathJson,
    scoring: scoringJson,
    cta: ctaJson
  });
}

/** Every `per`-screen pick count of 3 — the widest page 3 the UI can produce. */
const MAX_PICKS = { 'I-1': 3, 'I-2': 3, 'I-3': 3, 'I-4': 3 };

function pageCountOf(buffer) {
  const raw = buffer.toString('latin1');
  return Number((raw.match(/\/Count\s+(\d+)/) || [])[1]);
}

async function renderPages(record) {
  const buffer = await ReportPdf.renderReportPdf(modelFor(record), { Svg }, { pdfmake, fontPath });
  return { buffer, count: pageCountOf(buffer) };
}

/** The page-3 block carrying `label`, from the neutral model the PDF and the screen share. */
function blockByLabel(model, pageIndex, label) {
  const page = model.pages[pageIndex];
  return page.blocks.find((block) => block && block.label === label);
}

test('canonical: the gap block shows the approved GAP copy and never the retired classic line', () => {
  // The adapter keeps `classicImbalance` for legacy records and the reveal contract still asserts it
  // exists, but the approved report prints GAP[role] alone. Prefixing the classic framing put
  // removed copy back in front of visitors.
  //
  // The block names the gap role — the ally the visitor most needs — so the approved sentence is
  // GAP[gap], NOT GAP[the role the visitor picked]: choosing commander makes the gap chancellor.
  for (const role of ROLES) {
    const record = recordFor({ talentValue: 5, role });
    const gapKey = record.ironTriangle.gap;
    const canonicalGap = canonical.GAP[gapKey];
    const block = blockByLabel(modelFor(record), 2, ironJson.reveal.gapHeadline);

    assert.ok(canonicalGap, `role ${role}: no canonical GAP copy for gap role ${gapKey}`);
    assert.ok(block, `role ${role}: page 3 lost its ${ironJson.reveal.gapHeadline} block`);
    assert.ok(
      block.text.includes(canonicalGap),
      `role ${role}: the approved GAP sentence for the gap role ${gapKey} is missing from the gap block`
    );

    const classic = ironJson.gapInsights[gapKey].classicImbalance;
    if (classic) {
      assert.ok(
        !block.text.includes(classic),
        `role ${role}: the retired classic imbalance copy ("${classic}") must not reach the page`
      );
    }
  }
});

test('canonical: the gap block also names the ally role and the approved framing', () => {
  const record = recordFor({ talentValue: 5, role: 'chancellor' });
  const model = modelFor(record);
  const block = blockByLabel(model, 2, ironJson.reveal.gapHeadline);
  const gapRole = ironJson.roles.find((entry) => entry.key === record.ironTriangle.gap);

  assert.ok(gapRole, 'the record must carry a gap role');
  assert.ok(block.text.includes(gapRole.name), 'the gap block must name the ally role');
  assert.ok(block.text.includes(gapRole.chinese), 'the gap block must carry the role character');
  assert.ok(
    block.text.includes(ironJson.reveal.gapFraming),
    'the gap block must use the approved "The ally you most need" framing'
  );
  // One sentence, not two run together: no doubled full stop and no stranded separator.
  assert.ok(!/\.\s*\./.test(block.text), 'the gap sentence has a stranded or doubled full stop');
});

test('canonical: a legacy archetype key still resolves to the canonical archetype', () => {
  // "creative_analyst" is the pre-rename order of the canonical "analyst_creative" pair. A stored
  // record must keep rendering its archetype instead of losing the name on page 1.
  //
  // The profile must NOT be balanced, or the archetype heading is replaced by the balanced headline
  // and the assertion would pass without ever resolving the archetype.
  const shape = { answersByCategory: { analyst: 5, creative: 4, organiser: 2, communicator: 1 } };
  const legacy = modelFor(recordFor(Object.assign({ archetypeKey: 'creative_analyst' }, shape)));
  const canonicalRecord = modelFor(recordFor(Object.assign({ archetypeKey: 'analyst_creative' }, shape)));

  const legacyHeading = legacy.pages[0].blocks.find((block) => block.kind === 'pair');
  const canonicalHeading = canonicalRecord.pages[0].blocks.find((block) => block.kind === 'pair');

  assert.ok(legacyHeading, 'page 1 lost its archetype block');
  assert.ok(legacyHeading.archetypeHeading, 'a legacy archetype key must still resolve to a name');
  // Guard the fixture itself: a balanced profile renders the balanced headline and would make the
  // comparison below pass without ever resolving the archetype.
  const balancedHeadline = talentJson.snapshot && talentJson.snapshot.balancedHeadline;
  assert.notEqual(
    legacyHeading.archetypeHeading,
    balancedHeadline,
    'the fixture must not be a balanced profile, or the heading under test is never used'
  );
  assert.equal(
    legacyHeading.archetypeHeading,
    canonicalHeading.archetypeHeading,
    'the legacy key must resolve to the SAME archetype the canonical key does'
  );
});

test('canonical: no raw snake_case key is ever printed on any page', () => {
  // Guards the legacy ikigai keys that have no canonical counterpart: an unresolvable selection may
  // render as a dash, but it must never leak an internal key to the visitor.
  const model = modelFor(recordFor({ talentValue: 5, role: 'general', per: MAX_PICKS }));
  const serialized = JSON.stringify(model.pages);

  assert.ok(
    !/[a-z]{3,}_[a-z]{3,}/.test(serialized.replace(/"[a-z_]+":/g, '')),
    'an internal snake_case key leaked into the report pages'
  );
});

test('canonical: every talent level and role renders exactly three pages', async () => {
  // cta.report promises a "3-Page True Path Report" in two places, so the page count is a product
  // contract. The overflow is page-3 copy-depth dependent, so every level x role is exercised — and
  // every TALENT SHAPE, not just a uniform answer: a uniform answer can only ever produce a balanced
  // profile, whose page-3 alignment copy is the shortest, so a balanced-only sweep cannot see the
  // overflow that a lone leader or a tie produces.
  const offenders = [];
  for (const shape of PROFILE_SHAPES) {
    for (const talentValue of [1, 2, 3, 4, 5]) {
      for (const role of ROLES) {
        const scaled = {};
        Object.keys(shape.answersByCategory).forEach((key) => {
          scaled[key] = Math.max(1, Math.min(5, shape.answersByCategory[key] + (talentValue - 3)));
        });
        const { count } = await renderPages(
          recordFor({ role, talentValue, answersByCategory: scaled })
        );
        if (count !== 3) offenders.push(`${shape.name} @${talentValue} / ${role} -> ${count}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'these journeys did not render three pages: ' + offenders.join(', '));
});

test('canonical: the widest possible page 3 still renders three pages', async () => {
  // Three picks on each of the four screens is the deepest page 3 the UI allows — and the deepest
  // alignment/observation copy, so every talent shape is exercised against it.
  for (const shape of PROFILE_SHAPES) {
    for (const role of ROLES) {
      const { count } = await renderPages(
        recordFor({
          talentValue: 5,
          role,
          per: MAX_PICKS,
          answersByCategory: shape.answersByCategory
        })
      );
      assert.equal(
        count,
        3,
        `a max-length ${shape.name} ${role} journey rendered ${count} pages, not 3`
      );
    }
  }
});

test('canonical: the page 3 that previously spilled keeps its closing copy on page 3', async () => {
  // Regression guard for the exact shape that shipped a fourth page: one pick on I-1/I-2/I-4 and two
  // on I-3, which makes the two alignment lines long enough that the trailing disclaimer margin
  // pushed the footer onto a page of its own. Pure spacing had to give way; no copy may be dropped,
  // so the last page must still carry the reflection list, the invite and the disclaimer.
  const record = recordFor({
    talentValue: 1,
    role: 'chancellor',
    per: { 'I-1': 1, 'I-2': 1, 'I-3': 2, 'I-4': 1 }
  });
  const { count } = await renderPages(record);

  assert.equal(count, 3, 'the previously spilling journey rendered ' + count + ' pages');

  const model = modelFor(record);
  const page3 = model.pages[2];
  const kinds = page3.blocks.map((block) => block.kind);

  assert.ok(kinds.includes('list-block'), 'page 3 lost its reflection/alignment lists');
  assert.ok(kinds.includes('invite'), 'page 3 lost the closing invite');
  // The reflection prompts and the invite copy are the LAST content before the disclaimer, so they
  // are what a spilled page would have taken with it.
  const reflection = page3.blocks.filter((block) => block.kind === 'list-block');
  assert.ok(
    reflection.some((block) => (block.items || []).length > 0),
    'the reflection prompts were dropped from the last page'
  );

  // The disclaimer is appended by the PDF layer, so assert it against the definition rather than the
  // model — and assert it is still the final element, after every page of content.
  const definition = ReportPdf.buildReportPdfDefinition(model, { Svg });
  const last = definition.content[definition.content.length - 1];
  assert.ok(
    String(last.text || '').includes('reflective self-discovery tool'),
    'the closing disclaimer is missing from the end of the document'
  );
});

/** Journey shapes that exercise all three lead-line branches, plus the balanced case. */
const PROFILE_SHAPES = [
  { name: 'balanced', answersByCategory: { organiser: 4, analyst: 4, communicator: 4, creative: 4 } },
  { name: 'tie', answersByCategory: { organiser: 5, analyst: 5, communicator: 3, creative: 2 } },
  { name: 'leader', answersByCategory: { organiser: 5, analyst: 2, communicator: 2, creative: 2 } }
];

test('canonical: the lead line follows the approved precedence for every talent level', () => {
  // Balanced profile > tie > single leader. A balanced profile must never be told a branch leads it.
  // A uniform answer across all 12 questions can only ever produce the balanced branch, so the sweep
  // walks the three shapes explicitly AND scales each one through the five levels.
  const seen = new Set();

  for (const shape of PROFILE_SHAPES) {
    for (const talentValue of [1, 2, 3, 4, 5]) {
      const scaled = {};
      Object.keys(shape.answersByCategory).forEach((key) => {
        scaled[key] = Math.max(1, Math.min(5, shape.answersByCategory[key] + (talentValue - 3)));
      });

      const record = recordFor({ role: 'chancellor', answersByCategory: scaled });
      const pair = modelFor(record).pages[0].blocks.find((block) => block.kind === 'pair');
      const lead = pair.leadLine;

      assert.ok(lead && lead.length > 10, `${shape.name} @${talentValue}: page 1 lost its lead line`);

      if (record.talent.balancedProfile) {
        seen.add('balanced');
        assert.match(
          lead,
          /no single Talent leads/,
          `${shape.name} @${talentValue}: a balanced profile was told that one branch leads`
        );
      } else if (record.talent.coDominant) {
        seen.add('tie');
        assert.match(lead, /equally strong/, `${shape.name} @${talentValue}: a tie must be read as a tie`);
      } else {
        seen.add('leader');
        assert.match(
          lead,
          /leads, (with|followed by)/,
          `${shape.name} @${talentValue}: a single leader must name the runner-up`
        );
      }
    }
  }

  assert.deepEqual(
    [...seen].sort(),
    ['balanced', 'leader', 'tie'],
    'the sweep must exercise every lead-line branch, not just one: ' + [...seen].join(', ')
  );
});

test('canonical: the tree highlights exactly the tied branches, and nothing when balanced', () => {
  // Canonical `hi`: seats whose RAW score equals the dominant one — except a balanced profile, which
  // has no leader and therefore no glow. `pct` saturates at 100 so it cannot decide this.
  // A uniform answer is balanced at every level, so the highlight rule is exercised per shape.
  const highlights = new Set();

  for (const shape of PROFILE_SHAPES) {
    for (const talentValue of [1, 2, 3, 4, 5]) {
      const scaled = {};
      Object.keys(shape.answersByCategory).forEach((key) => {
        scaled[key] = Math.max(1, Math.min(5, shape.answersByCategory[key] + (talentValue - 3)));
      });

      const record = recordFor({ role: 'chancellor', answersByCategory: scaled });
      const tree = modelFor(record).pages[0].blocks.find((block) => block.kind === 'talent-tree');

      assert.ok(tree.raw, 'the tree block must carry the raw scores the highlight rule needs');

      const svg = Svg.talentTreeSvg(tree.pct, tree.categories, {
        raw: tree.raw,
        dominant: tree.dominant,
        balancedProfile: tree.balancedProfile,
        ariaLabel: 'Talent Tree'
      });

      assert.match(svg, /viewBox="0 0 260 250"/, 'the tree must keep the canonical 260x250 frame');

      const litSeats = tree.categories.filter(
        (category) => tree.raw[category.key] === tree.raw[tree.dominant]
      ).length;

      if (record.talent.balancedProfile) {
        highlights.add('none');
        assert.ok(
          !svg.includes('drop-shadow'),
          `${shape.name} @${talentValue}: a balanced profile must not render a forced glow`
        );
      } else {
        assert.ok(litSeats >= 1, 'a non-balanced profile always has at least the dominant branch lit');
        highlights.add(litSeats > 1 ? 'tie' : 'single');
        assert.ok(svg.includes('drop-shadow'), 'the leader must be highlighted');
      }
    }
  }

  assert.deepEqual(
    [...highlights].sort(),
    ['none', 'single', 'tie'],
    'the sweep must cover no highlight, a single lit branch and a tie: ' + [...highlights].join(', ')
  );
});

test('canonical: the triangle keeps the canonical frame and proportional shape', () => {
  const model = modelFor(recordFor({ talentValue: 5, role: 'commander' }));
  const tri = model.pages[2].blocks.find((block) => block.kind === 'iron-triangle');

  const svg = Svg.ironTriangleSvg(tri.shares, tri.roles, { ariaLabel: 'Iron Triangle' });

  assert.match(svg, /viewBox="0 0 300 262"/, 'the triangle must keep the canonical 300x262 frame');
  assert.match(svg, /class=grow|class="grow"/, 'the visitor shape must keep the animated grow class');
  assert.ok(svg.includes('150,28 36,226 264,226'), 'the canonical corner seats changed');
  // The disclosure is an on-screen affordance; the PDF renderer strips it so no bare "i" survives.
  assert.ok(!/<details/.test(ReportPdf.stripSvgDisclosures(svg)), 'the PDF must not carry a <details>');
});

test('canonical: an array-authored role field reaches the page as readable text', () => {
  // `iron-triangle.json` authors `thrive` as a string while other role fields can be arrays; a
  // renderer that prints the raw value would show "a,b" or an object. The record picks the role the
  // array field belongs to, so the block under test is the one that role actually renders.
  const arrayIron = JSON.parse(JSON.stringify(ironJson));
  const role = arrayIron.roles.find((entry) => entry.key === 'chancellor');
  role.thrive = ['First thrive sentence.', 'Second thrive sentence.'];

  const record = recordFor({ talentValue: 5, role: 'chancellor' });
  assert.equal(
    record.ironTriangle.primary,
    'chancellor',
    'the fixture must make chancellor the primary role, or the array field never renders'
  );

  const model = modelFor(record, { ironTriangle: arrayIron });
  const block = blockByLabel(model, 2, arrayIron.reveal.thriveHeadline);

  assert.ok(block, 'page 3 lost its thrive block');
  assert.equal(typeof block.text, 'string', 'an array-authored role field must normalise to text');
  assert.ok(block.text.includes('First thrive sentence.'), 'the first thrive sentence was dropped');
  assert.ok(block.text.includes('Second thrive sentence.'), 'the second thrive sentence was dropped');
  assert.ok(!block.text.includes(','), 'array items must not be joined with a bare comma');
});

test('canonical: a legacy Ikigai option key still reaches the page as its canonical label', () => {
  // Records stored before the vocabulary flip carry "helping_others_transform" where the canonical
  // config lists "helping_transform". Same option, so a stored record shows the sentence form
  // instead of a dash — and the READ side never leaks the legacy snake_case key to the page.
  const legacyKey = 'helping_others_transform';

  const record = recordFor({ talentValue: 5, role: 'commander' });
  record.ikigai.energises = [legacyKey];

  const model = modelFor(record);
  // v2.2 C4: page 2 carries the four Direction sentences; the energises sentence must resolve
  // the legacy key to its canonical sentence form.
  const block = model.pages[1].blocks.find(
    (entry) => entry.kind === 'text' && entry.text && entry.text.includes('come alive')
  );
  assert.ok(block, 'page 2 lost its Direction sentences');
  assert.equal(
    block.text,
    'You come alive when you are helping others transform.',
    'a legacy option key must resolve to its canonical sentence form rather than a dash'
  );
  assert.ok(!block.text.includes(legacyKey), 'the raw legacy key must never reach the page');
});

test('canonical: two fresh renders of one fixed record produce identical PDF bytes', async () => {
  // pdfmake/pdfkit stamp the wallclock into CreationDate and derive the file ID from it, so the same
  // record used to yield different attachment bytes on every render — a Resend retry would have sent
  // a different payload for one visitor's report. Both renders build a FRESH model and definition:
  // pdfmake mutates the definition nodes it is handed.
  const record = recordFor({ talentValue: 5, role: 'chancellor' });
  const fontDeps = { pdfmake, fontPath };

  const first = await ReportPdf.renderReportPdf(modelFor(record), { Svg }, fontDeps);
  // Cross a wallclock second (the metadata previously carried millisecond resolution).
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const second = await ReportPdf.renderReportPdf(modelFor(record), { Svg }, fontDeps);

  assert.ok(first.equals(second), 'the same record rendered two different PDF attachments');
  assert.equal(pageCountOf(first), pageCountOf(second), 'the two renders disagree on page count');
  assert.match(first.toString('latin1'), /\/CreationDate/, 'the pinned creation date is missing');
});

test('canonical: the pinned PDF date comes from createdAt, not the wallclock', () => {
  const record = recordFor({ talentValue: 5, role: 'chancellor' });
  const model = modelFor(record);

  const definition = ReportPdf.buildReportPdfDefinition(model, { Svg });
  assert.ok(definition.info.creationDate instanceof Date, 'creationDate must be a Date');
  assert.equal(
    definition.info.creationDate.getTime(),
    new Date(record.createdAt).getTime(),
    'the PDF creation date must be the record instant'
  );

  // A record with no usable createdAt still gets a fixed instant rather than "now".
  const blank = ReportPdf.buildReportPdfDefinition(
    Object.assign({}, model, { createdAt: null }),
    { Svg }
  );
  assert.ok(!isNaN(blank.info.creationDate.getTime()), 'a missing createdAt must not produce NaN');
  assert.equal(blank.info.creationDate.getTime(), 0, 'the fallback instant must be fixed, not now');

  // Garbage in the record must not reach pdfkit as an Invalid Date.
  ['not-a-date', {}, [], ''].forEach((bad) => {
    const framed = ReportPdf.buildReportPdfDefinition(
      Object.assign({}, model, { createdAt: bad }),
      { Svg }
    );
    assert.ok(
      !isNaN(framed.info.creationDate.getTime()),
      `createdAt ${JSON.stringify(bad)} produced an invalid date`
    );
  });
  // The pinned instant is the RECORD's, zone-accurate: 2026-09-24T10:00+08:00 === 02:00Z.
  assert.equal(
    ReportPdf.stableDate('2026-09-24T10:00:00+08:00').toISOString(),
    '2026-09-24T02:00:00.000Z',
    'stableDate must preserve the configured instant exactly'
  );
  // Determinism across the process: the same input always yields the same instant, including the
  // millisecond the file ID is derived from.
  const first = ReportPdf.stableDate('2026-09-24T10:00:00+08:00');
  const second = ReportPdf.stableDate('2026-09-24T10:00:00+08:00');
  assert.equal(first.getTime(), second.getTime());
});

test('canonical: the PDF carries the three-page CJK report it promises', async () => {
  const { buffer, count } = await renderPages(recordFor({ talentValue: 5, role: 'chancellor' }));
  const raw = buffer.toString('latin1');

  assert.equal(count, 3, 'the report must be three pages');
  assert.equal(buffer.slice(0, 5).toString('latin1'), '%PDF-');
  assert.match(raw, /\/FontFile2/, 'the CJK font file was not embedded');
  assert.match(raw, /Subtype \/Type0/, 'the CJK font was not embedded as a composite font');
  assert.match(raw, /Identity-H/, 'the CJK font is not using a CID encoding');
  assert.match(raw, /\/ToUnicode/, 'the CJK text would not be extractable');

  const model = modelFor(recordFor({ talentValue: 5, role: 'chancellor' }));
  const serialized = JSON.stringify(model);
  ['\u624d', '\u9053', '\u4f4d', '\u5e05', '\u5c06', '\u76f8', '\u8f68\u9053'].forEach((glyph) => {
    assert.ok(serialized.includes(glyph), `the report lost the CJK glyph ${glyph}`);
  });
});
