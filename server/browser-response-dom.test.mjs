import test from "node:test";
import assert from "node:assert/strict";
import { providerNotices } from "../ecosystem/plugins/reference/gemini-browser-studio/response-guard.mjs";

// Local, isolated browser only; no user profile or provider request.
// Set PLAYWRIGHT_MODULE to the installed playwright module entrypoint.
test(
  "visible provider notices exclude hidden elements, editor and assistant content",
  {
    skip: !process.env.PLAYWRIGHT_MODULE,
  },
  async () => {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.TEST_CHROME_PATH || undefined,
    });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort());
      await page.setContent(`<button>Faça upgrade</button>
      <div class="model-response-text"><div role="alert">You've reached your limit</div></div>
      <user-query><div role="alert">Cota esgotada</div></user-query>
      <div contenteditable="true"><span role="alert">Cota esgotada</span></div>
      <div role="alert" style="display:none">Cota esgotada</div>`);
      assert.deepEqual(await page.evaluate(providerNotices), []);
      await page
        .locator("body")
        .evaluate((el) =>
          el.insertAdjacentHTML(
            "beforeend",
            '<div role="alert">Você atingiu seu limite de uso.</div>',
          ),
        );
      assert.deepEqual(await page.evaluate(providerNotices), ["Você atingiu seu limite de uso."]);
    } finally {
      await browser.close();
    }
  },
);
