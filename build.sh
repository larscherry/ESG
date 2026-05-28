#!/usr/bin/env bash
set -o errexit

echo "=== Installing Node.js ==="
# Render provides nvm; use it to install Node
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  \. "$NVM_DIR/nvm.sh"
  nvm install "${NODE_VERSION:-20}" > /dev/null
  nvm use "${NODE_VERSION:-20}" > /dev/null
else
  # Fallback: download Node directly
  curl -fsSL https://nodejs.org/dist/v${NODE_VERSION:-20.18.0}/node-v${NODE_VERSION:-20.18.0}-linux-x64.tar.xz -o /tmp/node.tar.xz
  mkdir -p /tmp/node
  tar -xf /tmp/node.tar.xz -C /tmp/node --strip-components=1
  export PATH="/tmp/node/bin:$PATH"
fi

echo "Node: $(node -v)  npm: $(npm -v)"

echo "=== Building frontend ==="
cd frontend
npm ci --omit=optional
npm run build
cd ..

echo "=== Collecting static files ==="
python manage.py collectstatic --noinput --clear

echo "=== Running migrations ==="
python manage.py migrate --run-syncdb

echo "=== Seeding sample data ==="
python manage.py seed_sample_data

echo "=== Build complete ==="
