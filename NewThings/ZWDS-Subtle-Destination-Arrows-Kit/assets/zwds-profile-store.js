// @ts-check

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).ZwdsProfileStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'tfp.zwds.profiles.v1';
  const SELECTED_KEY = 'tfp.zwds.selected-profile.v1';

  function makeId() {
    const cryptoApi = root && root.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function safeStorage(storage) {
    try {
      if (!storage) return null;
      const probe = '__zwds_storage_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (_) {
      return null;
    }
  }

  function normalizeProfile(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Profile data is invalid.');
    const input = raw.input && typeof raw.input === 'object' ? raw.input : raw;
    const name = String(input.profileName || input.name || '').trim().slice(0, 80) || 'Chart Owner';
    const calendarType = input.calendarType === 'lunar' ? 'lunar' : 'solar';
    const gender = input.gender === 'female' ? 'female' : 'male';
    const birthDate = String(input.birthDate || input.sourceDate || '').trim();
    const birthTime = String(input.birthTime || input.exactBirthTime || '12:00').trim() || '12:00';
    return {
      id: String(raw.id || makeId()),
      createdAt: String(raw.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      input: {
        profileName: name,
        calendarType,
        birthDate,
        gender,
        birthTime,
        isUnknownTime: input.isUnknownTime === true,
        isLeapMonth: input.isLeapMonth === true
      }
    };
  }

  function createStore(storage) {
    const backend = safeStorage(storage);
    let memoryProfiles = [];
    let memorySelectedId = null;

    function readProfiles() {
      if (!backend) return memoryProfiles.slice();
      try {
        const parsed = JSON.parse(backend.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeProfile);
      } catch (_) {
        return [];
      }
    }

    function writeProfiles(profiles) {
      const normalized = profiles.map(normalizeProfile);
      if (!backend) memoryProfiles = normalized;
      else backend.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    }

    function selectedId() {
      if (!backend) return memorySelectedId;
      return backend.getItem(SELECTED_KEY);
    }

    function setSelectedId(id) {
      const value = id == null ? null : String(id);
      if (!backend) memorySelectedId = value;
      else if (value == null) backend.removeItem(SELECTED_KEY);
      else backend.setItem(SELECTED_KEY, value);
    }

    function upsert(profile) {
      const normalized = normalizeProfile(profile);
      const profiles = readProfiles();
      const index = profiles.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        normalized.createdAt = profiles[index].createdAt;
        profiles[index] = normalized;
      } else profiles.push(normalized);
      writeProfiles(profiles);
      setSelectedId(normalized.id);
      return normalized;
    }

    function remove(id) {
      const profiles = readProfiles().filter((item) => item.id !== id);
      writeProfiles(profiles);
      if (selectedId() === id) setSelectedId(profiles[0] ? profiles[0].id : null);
      return profiles;
    }

    function replaceAll(profiles) {
      const normalized = writeProfiles(profiles);
      const current = selectedId();
      if (!normalized.some((item) => item.id === current)) setSelectedId(normalized[0] ? normalized[0].id : null);
      return normalized;
    }

    function merge(imported) {
      if (!Array.isArray(imported)) throw new Error('The import file must contain a profile list.');
      const existing = new Map(readProfiles().map((item) => [item.id, item]));
      imported.map(normalizeProfile).forEach((item) => existing.set(item.id, item));
      const merged = writeProfiles(Array.from(existing.values()));
      return merged;
    }

    function exportPayload() {
      return {
        format: 'tfp-zwds-profiles',
        version: 1,
        exportedAt: new Date().toISOString(),
        profiles: readProfiles()
      };
    }

    return Object.freeze({
      persistent: Boolean(backend),
      list: readProfiles,
      selectedId,
      setSelectedId,
      upsert,
      remove,
      replaceAll,
      merge,
      exportPayload,
      normalizeProfile
    });
  }

  return Object.freeze({ STORAGE_KEY, SELECTED_KEY, normalizeProfile, createStore });
});
