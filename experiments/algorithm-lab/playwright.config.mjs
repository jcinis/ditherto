import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'lab.spec.mjs', workers: 3,
  projects: ['chromium','firefox','webkit'].map(browserName=>({name:browserName,use:{browserName}})),
  use: {baseURL:'http://127.0.0.1:4182',viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer: {command:'python3 -m http.server 4182 --bind 127.0.0.1 --directory ../..',url:'http://127.0.0.1:4182',reuseExistingServer:!process.env.CI},
  outputDir:'../../test-results/algorithm-lab', reporter:'list',
});
