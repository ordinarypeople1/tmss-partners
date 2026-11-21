// Development helper: drives a running dev server (npm run dev) through the
// game with Playwright, so a screen can be checked in a real state without
// clicking for ten minutes. Uses the window.__game hook from src/ui/game.tsx.
//
//   const { open, acquire } = require("./tools/dev/drive.cjs");
//   const { browser, page } = await open(5173);
//   const company = await acquire(page);   // plays until the fund owns something
//   await page.screenshot({ path: "shot.png" });
//   await browser.close();
const { chromium } = require("playwright");

async function open(port = 5173, viewport = { width: 1440, height: 900 }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(`http://127.0.0.1:${port}/`);
  // A fresh game in Korean, whatever the headless browser's language is.
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("deal-atlas.locale", "ko");
  });
  await page.reload();
  await page.waitForSelector(".sidebar", { timeout: 20000 });
  return { browser, page, errors };
}

const cmd = (page, command) => page.evaluate((c) => window.__game.command(c), command);
const view = (page) => page.evaluate(() => window.__game.view());
const months = async (page, count = 1) => {
  for (let i = 0; i < count; i += 1) {
    await cmd(page, { type: "advance_month" });
  }
};

/** Signs an NDA on the first visible sale and returns the company index, or null. */
async function openDeal(page, maxMonths = 24) {
  for (let i = 0; i < maxMonths; i += 1) {
    const state = await view(page);
    const target = state.companies.find((row) => row.sale && !row.in_deal && !row.held && row.sale.stage !== "bidding" && row.sale.invited && row.country === "US");
    if (target) {
      const result = await cmd(page, { type: "sign_nda", company: target.i });
      if (result.ok) {
        return target.i;
      }
    }
    await months(page);
  }
  return null;
}

/** A valuation, diligence, an offer, and the committee on an open deal. Leaves the bid to the caller. */
async function prepare(page, company) {
  // A valuation first: nothing can be priced without one. It comes in at month end.
  await cmd(page, { type: "order_valuation", company, kind: "adviser" });
  for (const stream of ["financial", "commercial", "operational", "legal"]) {
    await cmd(page, { type: "run_diligence", company, stream });
  }
  // Round one: a number before the bank cuts its shortlist.
  const early = (await view(page)).companies.find((item) => item.i === company);
  if (early && early.sale && early.sale.round === 1) {
    await months(page);
    const valued = (await view(page)).companies.find((item) => item.i === company);
    if (valued && valued.ev) {
      await cmd(page, { type: "submit_indication", company, ev: Math.round(valued.ev[0] * 1.06) });
    }
  }
  for (let wait = 0; wait < 4; wait += 1) {
    await months(page);
    const now = (await view(page)).companies.find((item) => item.i === company);
    if (!now || !now.in_deal || !now.sale || now.sale.round !== 1) {
      break;
    }
  }
  // Round two: the data room.
  for (const stream of ["operational", "legal"]) {
    await cmd(page, { type: "run_diligence", company, stream });
  }
  await months(page);
  const state = await view(page);
  const row = state.companies.find((item) => item.i === company);
  if (!row || !row.in_deal || !row.ev) {
    return false;
  }
  const offer = {
    ev: Math.round(row.ev[0] * 1.06),
    senior_millis: Math.min(state.economy.max_senior_millis, 3800),
    mezz_millis: 0,
    rollover_bps: 0,
    plan: ["procurement", "lean_program"],
  };
  await cmd(page, { type: "set_offer", company, offer });
  await cmd(page, { type: "submit_ic", company });
  return true;
}

/** Plays until the fund owns a company. Returns its index, or null after `maxMonths`. */
async function acquire(page, maxMonths = 72) {
  for (let i = 0; i < maxMonths; i += 1) {
    let state = await view(page);
    const held = state.companies.find((row) => row.held);
    if (held) {
      return held.i;
    }
    if (state.deals.length === 0) {
      const company = await openDeal(page, 6);
      if (company !== null) {
        await prepare(page, company);
      }
    }
    state = await view(page);
    for (const company of state.deals) {
      const row = state.companies.find((item) => item.i === company);
      if (row && row.sale && row.sale.stage === "bidding" && !row.sale.bid_in) {
        await cmd(page, { type: "submit_bid", company });
      }
    }
    await months(page);
  }
  return null;
}

module.exports = { open, cmd, view, months, openDeal, prepare, acquire };
