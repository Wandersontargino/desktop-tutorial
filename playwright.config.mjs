import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:90000,expect:{timeout:15000},fullyParallel:false,workers:1,retries:process.env.CI?1:0,reporter:[['list'],['html',{outputFolder:'.sites-runtime/playwright-report',open:'never'}]],outputDir:'.sites-runtime/playwright-results',
  use:{baseURL:'https://localhost:4173',ignoreHTTPSErrors:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'firefox',use:{...devices['Desktop Firefox']}},{name:'webkit',use:{...devices['Desktop Safari']}},{name:'mobile-chromium',use:{...devices['Pixel 5']}}],
  webServer:{command:'node scripts/e2e-server.mjs',url:'https://localhost:4173/__test/ready',ignoreHTTPSErrors:true,reuseExistingServer:false,timeout:60000}
});
