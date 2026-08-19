const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const dir = process.argv[2];
  for (const [url, name] of [["http://localhost:3000/", "main"], ["http://localhost:3002/", "insta"]]) {
    const page = await b.newPage({ viewport: { width: 1280, height: 1000 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" && !t.includes("CONNECTION_RESET") && !t.includes("fonts.googleapis")) errs.push(t);
    });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const h1 = await page.locator("h1").first().textContent().catch(() => "(なし)");
    const btns = await page.locator("button.btn-primary").allTextContents();
    console.log(`${url}\n  見出し: ${JSON.stringify(h1)}\n  主ボタン: ${JSON.stringify(btns)}\n  外部リンク: ${JSON.stringify(await page.locator(".ip-navlink").allTextContents())}\n  JSエラー: ${errs.length ? errs.join(" | ") : "なし"}`);
    await page.screenshot({ path: `${dir}/${name}.png` });
    await page.close();
  }
  await b.close();
})();
