const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

(async () => {
  const lectures = await fs.readJSON("lectures.json");
  const cookies = await fs.readJSON("cookies.json");

  // Prepare cookies string for axios
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setCookie(...cookies);

  for (const { section, title, url } of lectures.slice(0, 2)) {
    //test first 2 (replace with your desired limit)
    console.log(`Visiting: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

    // Get all download links (.mp4, .mp3, .pdf)
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a.download"));
      return anchors.map((a) => a.href);
    });

    if (links.length === 0) {
      console.log("❌ No downloadable links found.");
      continue;
    }

    // Clean folder and file names
    const safeSection = section.replace(/[\/\\:*?"<>|]/g, "_");
    const safeTitle = title.replace(/[\/\\:*?"<>|]/g, "_").split("\n")[0];

    const folderPath = path.join(__dirname, "downloads", safeSection);
    await fs.ensureDir(folderPath);

    for (const link of links) {
      let ext = path.extname(new URL(link).pathname).toLowerCase();

      // If extension is missing or too short (e.g. just a "?")
      if (!ext || ext.length < 2) {
        try {
          const headRes = await axios.head(link, {
            headers: {
              Cookie: cookieString,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
            },
          });

          const contentType = headRes.headers["content-type"];
          if (contentType) {
            if (contentType.includes("video/mp4")) ext = ".mp4";
            else if (contentType.includes("audio/mpeg")) ext = ".mp3";
            else if (contentType.includes("application/pdf")) ext = ".pdf";
            else ext = "";
          }
        } catch {
          ext = "";
        }
      }

      // Use default fallback if still missing
      if (!ext || ext === ".bin") {
        ext = ".mp4"; // safest guess
      }

      const fileName = `${safeTitle}${ext}`;

      const filePath = path.join(folderPath, fileName);

      if (fs.existsSync(filePath)) {
        console.log(`✅ Already downloaded: ${fileName}`);
        continue;
      }

      try {
        // Add cookies and User-Agent headers here
        const res = await axios.get(link, {
          responseType: "stream",
          headers: {
            Cookie: cookieString,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          },
        });

        const writer = fs.createWriteStream(filePath);
        res.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });
        console.log(`✅ Downloaded: ${fileName}`);
      } catch (err) {
        console.log(`❌ Failed: ${fileName} - ${err.message}`);
      }
    }
  }

  await browser.close();
})();
