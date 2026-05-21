import puppeteer from "puppeteer";

const url = process.env.URL || "http://localhost:5000/restaurant";
const out = process.env.OUT || "attached_assets/landing-mobile.png";

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: process.env.CHROME || "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  );
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: out, type: "png" });
  console.log("Wrote", out);
} finally {
  await browser.close();
}
