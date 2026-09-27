// @ts-check
/**
 * True Path — journey state.
 *
 * Brief 17 acceptance: "Refresh or Back at any step keeps answers." Brief 12: the
 * journey lives in sessionStorage and is archived only when the visitor submits their email.
 *
 * Everything is keyed by STABLE IDs (question id, screen id, option key, scenario id,
 * role key) and never by display position, so randomising card order can never corrupt
 * a stored answer (Brief 4 / 6.3).
 */

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'tfp.truepath.journey.v1';
  const RESULT_KEY = 'tfp.truepath.result.v1';

  function safeStorage(storage) {
    try {
      if (!storage) return null;
      const probe = '__truepath_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (error) {
      return null;
    }
  }

  function emptyState() {
    return {
      version: '1.0',
      talentAnswers: {},
      ikigaiPicks: [],
      scenarioAnswers: {},
      scenarioOrder: {},
      createdAt: null,
      updatedAt: null
    };
  }

  /**
   * @param {any} storage sessionStorage-like object; falls back to in-memory
   */
  function createStore(storage) {
    const backend = safeStorage(storage);
    let memory = emptyState();

    function read() {
      if (!backend) return memory;
      try {
        const raw = backend.getItem(STORAGE_KEY);
        if (!raw) return emptyState();
        const parsed = JSON.parse(raw);
        return normalize(parsed);
      } catch (error) {
        return emptyState();
      }
    }

    function write(state) {
      const next = normalize(state);
      next.updatedAt = new Date().toISOString();
      if (!next.createdAt) next.createdAt = next.updatedAt;
      memory = next;
      if (backend) {
        try {
          backend.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (error) {
          /* storage full or blocked: keep the in-memory copy */
        }
      }
      return next;
    }

    function normalize(input) {
      const base = emptyState();
      if (!input || typeof input !== 'object') return base;
      return {
        version: '1.0',
        talentAnswers: sanitizeAnswers(input.talentAnswers),
        ikigaiPicks: sanitizePicks(input.ikigaiPicks),
        scenarioAnswers: sanitizeScenarioAnswers(input.scenarioAnswers),
        scenarioOrder: sanitizeScenarioOrder(input.scenarioOrder),
        createdAt: input.createdAt || base.createdAt,
        updatedAt: input.updatedAt || base.updatedAt
      };
    }

    /** Answer values are clamped integers 1..5, stored by question id. */
    function sanitizeAnswers(input) {
      const out = {};
      if (!input || typeof input !== 'object') return out;
      Object.keys(input).forEach((questionId) => {
        const value = Math.round(Number(input[questionId]));
        if (Number.isFinite(value) && value >= 1 && value <= 5) out[questionId] = value;
      });
      return out;
    }

    function sanitizeScenarioAnswers(input) {
      const out = {};
      if (!input || typeof input !== 'object') return out;
      Object.keys(input).forEach((scenarioId) => {
        const role = input[scenarioId];
        // Store the ROLE KEY, never the displayed position (Brief 6.3).
        if (role === 'commander' || role === 'general' || role === 'chancellor') {
          out[scenarioId] = role;
        }
      });
      return out;
    }

    function sanitizeScenarioOrder(input) {
      const out = {};
      if (!input || typeof input !== 'object') return out;
      Object.keys(input).forEach((scenarioId) => {
        const order = input[scenarioId];
        if (!Array.isArray(order)) return;
        const filtered = order.filter(
          (role) => role === 'commander' || role === 'general' || role === 'chancellor'
        );
        if (filtered.length === 3) out[scenarioId] = filtered;
      });
      return out;
    }

    /** Ikigai picks are { screenId, key, fromSuggestion } with stable keys only. */
    function sanitizePicks(input) {
      if (!Array.isArray(input)) return [];
      const seen = {};
      const out = [];
      input.forEach((pick) => {
        if (!pick || typeof pick !== 'object') return;
        const screenId = String(pick.screenId || '');
        const key = String(pick.key || '');
        if (!screenId || !key) return;
        const dedupe = `${screenId}::${key}`;
        if (seen[dedupe]) return;
        seen[dedupe] = true;
        out.push({ screenId, key, fromSuggestion: Boolean(pick.fromSuggestion) });
      });
      return out;
    }

    return Object.freeze({
      STORAGE_KEY,
      RESULT_KEY,
      persistent: Boolean(backend),
      getState: read,
      setTalentAnswer(questionId, value) {
        const state = read();
        state.talentAnswers[questionId] = value;
        return write(state);
      },
      setIkigaiPicks(screenId, picks) {
        const state = read();
        const others = state.ikigaiPicks.filter((pick) => pick.screenId !== screenId);
        const normalized = sanitizePicks(
          picks.map((pick) => Object.assign({}, pick, { screenId }))
        );
        state.ikigaiPicks = others.concat(normalized);
        return write(state);
      },
      setScenarioAnswer(scenarioId, roleKey, shownOrder) {
        const state = read();
        state.scenarioAnswers[scenarioId] = roleKey;
        if (Array.isArray(shownOrder) && shownOrder.length === 3) {
          state.scenarioOrder[scenarioId] = shownOrder.slice();
        }
        return write(state);
      },
      clear() {
        memory = emptyState();
        if (backend) {
          try {
            backend.removeItem(STORAGE_KEY);
          } catch (error) {
            /* ignore */
          }
        }
        return memory;
      },
      /** Used by Back and refresh to repopulate a step from the stored answers. */
      restore(state) {
        return write(state || emptyState());
      }
    });
  }

  /**
   * The finished result is stored separately so a report link can be re-opened.
   */
  function createResultStore(storage) {
    const backend = safeStorage(storage);
    let memory = null;

    return Object.freeze({
      read() {
        if (!backend) return memory;
        try {
          const raw = backend.getItem(RESULT_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (error) {
          return null;
        }
      },
      write(result) {
        memory = result;
        if (backend) {
          try {
            backend.setItem(RESULT_KEY, JSON.stringify(result));
          } catch (error) {
            /* ignore */
          }
        }
        return result;
      },
      clear() {
        memory = null;
        if (backend) {
          try {
            backend.removeItem(RESULT_KEY);
          } catch (error) {
            /* ignore */
          }
        }
      }
    });
  }

  return Object.freeze({ STORAGE_KEY, RESULT_KEY, createStore, createResultStore });
});
