#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
node --check assets/relationship-routing.js
node --check assets/zwds.js
node --check assets/zwds-engine-adapter.js
node --check assets/zwds-time-state.js
node --check assets/zwds-view-model.js
node tests/test-relationships.js
node tests/test-routing.js
node tests/test-static.js
echo "ALL TESTS PASSED"
