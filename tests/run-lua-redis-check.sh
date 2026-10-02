#!/usr/bin/env bash
set -euo pipefail

# Run from WSL/Linux. Keep the download in ignored scratch; build on the native filesystem.
repo_root=$(cd "$(dirname "$0")/.." && pwd)
work_dir=$(mktemp -d /tmp/true-path-redis.XXXXXX)
redis_pid=''
cleanup() {
  if [[ -n "$redis_pid" ]]; then
    kill "$redis_pid" 2>/dev/null || true
    wait "$redis_pid" 2>/dev/null || true
  fi
  case "$work_dir" in /tmp/true-path-redis.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT

archive="$repo_root/scratch/redis-7.2.5.tar.gz"
mkdir -p "$repo_root/scratch"
if [[ ! -f "$archive" ]]; then
  curl --fail --location --silent --show-error https://download.redis.io/releases/redis-7.2.5.tar.gz -o "$archive"
fi
tar -xzf "$archive" -C "$work_dir"
make -C "$work_dir/redis-7.2.5" -j2 BUILD_TLS=no MALLOC=libc redis-server > "$work_dir/build.log" 2>&1 || {
  tail -40 "$work_dir/build.log"
  exit 1
}

port=${TRUE_PATH_REDIS_PORT:-6399}
node -e 'const s=require("net").connect({host:"127.0.0.1",port:Number(process.argv[1])});s.on("connect",()=>{s.destroy();console.error("Test port already in use");process.exit(1)});s.on("error",e=>process.exit(e.code==="ECONNREFUSED"?0:1))' "$port"
"$work_dir/redis-7.2.5/src/redis-server" --bind 127.0.0.1 --port "$port" --save '' --appendonly no --dir "$work_dir" > "$work_dir/server.log" 2>&1 &
redis_pid=$!
sleep 1
kill -0 "$redis_pid"
cd "$repo_root"
REDIS_URL="redis://127.0.0.1:$port" node --test tests/true-path-lua-redis.test.mjs
