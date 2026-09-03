#!/usr/bin/env node

/**
 * scripts/audit-mobile-web.mjs
 * 
 * Script réutilisable d'audit de routes Web & Mobile Android (Pixel 7).
 * Utilisation :
 *   node scripts/audit-mobile-web.mjs /chemin1 /chemin2
 * Exemple :
 *   node scripts/audit-mobile-web.mjs /personal-driver/ /personal-driver/configurer/
 */

import { chromium, devices } from 'playwright';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const pixel7 = devices['Pixel 7'];

const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.log('Usage: node scripts/audit-mobile-web.mjs <route1> [route2] ...');
  console.log('Exemple: node scripts/audit-mobile-web.mjs /personal-driver/ /personal-driver/configurer/');
  process.exit(0);
}

async function auditRoute(route) {
  console.log(`\n========================================`);
  console.log(` AUDIT : ${route}`);
  console.log(`========================================`);

  const browser = await chromium.launch();

  // 1. Audit Desktop
  console.log(`\n🖥️  [DESKTOP]`);
  const desktopPage = await browser.newPage();
  const desktopConsoleErrors = [];
  const desktopPageErrors = [];
  desktopPage.on('console', (m) => {
    if (m.type() === 'error') desktopConsoleErrors.push(m.text());
  });
  desktopPage.on('pageerror', (e) => desktopPageErrors.push(e.message));

  try {
    const res = await desktopPage.goto(BASE_URL + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await desktopPage.waitForTimeout(1500);
    const h1 = await desktopPage.locator('h1').textContent().catch(() => 'aucun h1');
    console.log(`  - Statut HTTP: ${res ? res.status() : 'N/A'}`);
    console.log(`  - URL finale: ${desktopPage.url()}`);
    console.log(`  - H1: "${h1?.trim()}"`);
    console.log(`  - Exceptions page (React/SSR): ${desktopPageErrors.length}`);
    if (desktopPageErrors.length > 0) {
      desktopPageErrors.forEach((e) => console.log(`    ❌ ${e}`));
    }
    console.log(`  - Erreurs console: ${desktopConsoleErrors.length}`);
    if (desktopConsoleErrors.length > 0) {
      desktopConsoleErrors.forEach((e) => console.log(`    ⚠️ ${e}`));
    }
  } catch (err) {
    console.log(`  ❌ Échec de navigation desktop: ${err.message}`);
  } finally {
    await desktopPage.close();
  }

  // 2. Audit Mobile Android (Pixel 7)
  console.log(`\n📱 [MOBILE ANDROID - Pixel 7 (412x839)]`);
  const mobileContext = await browser.newContext({ ...pixel7 });
  const mobilePage = await mobileContext.newPage();
  const mobileConsoleErrors = [];
  const mobilePageErrors = [];
  mobilePage.on('console', (m) => {
    if (m.type() === 'error') mobileConsoleErrors.push(m.text());
  });
  mobilePage.on('pageerror', (e) => mobilePageErrors.push(e.message));

  try {
    const res = await mobilePage.goto(BASE_URL + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobilePage.waitForTimeout(1500);
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await mobilePage.evaluate(() => document.documentElement.clientWidth);
    const hasOverflow = scrollWidth > clientWidth;

    console.log(`  - Statut HTTP: ${res ? res.status() : 'N/A'}`);
    console.log(`  - Débordement horizontal: ${hasOverflow ? '❌ OUI (DÉBORDEMENT DÉTECTÉ)' : '✅ NON (Parfait)'} (${scrollWidth}px / ${clientWidth}px)`);
    console.log(`  - Exceptions page: ${mobilePageErrors.length}`);
    if (mobilePageErrors.length > 0) {
      mobilePageErrors.forEach((e) => console.log(`    ❌ ${e}`));
    }
    console.log(`  - Erreurs console: ${mobileConsoleErrors.length}`);
    if (mobileConsoleErrors.length > 0) {
      mobileConsoleErrors.forEach((e) => console.log(`    ⚠️ ${e}`));
    }
  } catch (err) {
    console.log(`  ❌ Échec de navigation mobile: ${err.message}`);
  } finally {
    await mobilePage.close();
    await mobileContext.close();
  }

  await browser.close();
}

(async () => {
  for (const route of routes) {
    await auditRoute(route);
  }
  console.log(`\n Audit terminé.\n`);
})();
