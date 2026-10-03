/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // The Lumen host runs web apps in GeckoView (Firefox 156).
    target: ['firefox128', 'chrome120'],
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
