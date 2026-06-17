#!/bin/bash
set -e
npm install
echo "" | npx drizzle-kit push || true
