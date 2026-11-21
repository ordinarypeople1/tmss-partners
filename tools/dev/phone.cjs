// Development helper: plays into a busy game and screenshots every screen at phone size (390x844).
// Usage: node tools/dev/phone.cjs <outdir> [port]
const { chromium } = require("playwright");
const drive = require("./drive.cjs");

(async () => {
  const out = process.argv[2];
  const port = Number(process.argv[3] || 5173);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("deal-atlas.locale", "ko");
  });
  await page.reload();
  // Through the title screen: no save, so only "new game" is there.
  await page.click('[data-title="new"]', { timeout: 20000 });
  await page.waitForSelector(".tabbar", { timeout: 20000 });
  const shot = async (name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/m-${name}.png` });
  };
  await shot("map-fresh");
  const company = await drive.openDeal(page);
  await drive.prepare(page, company);
  await page.evaluate((i) => window.__game.select(i), company);
  await shot("panel-deal");
  await page.evaluate(() => window.__game.select(null));
  const held = await drive.acquire(page);
  await page.keyboard.press("Escape");
  await drive.months(page, 10);
  await page.keyboard.press("Escape");
  for (const screen of ["map", "inbox", "deals", "portfolio", "market", "league", "fund", "career"]) {
    await page.evaluate((s) => window.__game.go(s), screen);
    await page.keyboard.press("Escape");
    await shot(screen);
  }
  await page.evaluate((i) => {
    window.__game.go("map");
    window.__game.select(i);
  }, held);
  await shot("panel-holding");
  await page.evaluate(() => window.__game.select(null));
  await page.click(".tabbar button:last-child");
  await shot("more");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log("held", held, "horizontal overflow px", overflow, "errors", errors.slice(0, 5));
  await browser.close();
})();
