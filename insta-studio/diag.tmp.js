const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await b.newPage();
  page.on("requestfailed", (r) => console.log("FAILED", r.url(), r.failure()?.errorText));
  page.on("response", async (r) => {
    if (r.status() >= 400) console.log("HTTP", r.status(), r.url());
  });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await b.close();
})();
