import { mkdirSync, writeFile } from "fs";
import { join } from "path";
import puppeteer from "puppeteer";
import sanitize from "sanitize-filename";
import { promisify } from "util";
import yargs from "yargs";

const writeFileAsync = promisify(writeFile);

const argv = yargs
  .option("url", {
    type: "string"
  })
  .option("output", {
    type: "string"
  })
  .demandOption("url")
  .demandOption("output").argv;

run(argv).catch(console.error);

async function run({ url, output }: typeof argv) {
  mkdirSync(output, {
    recursive: true
  });

  const browser = await puppeteer.launch({
    headless: false
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0);
  await page.goto(url);

  const linkElements = await page.$$("a");
  const promises: Array<Promise<void>> = [];
  for (const linkElement of linkElements) {
    const link = (await page.evaluate(
      link => link.href,
      linkElement
    )) as string;
    const title = await page.evaluate(link => link.textContent, linkElement);
    if (!link.toLowerCase().endsWith(".pdf")) {
      // Only look at PDFs.
      continue;
    }
    const destinationFilename = sanitize(`${title}.pdf`, { replacement: "-" });
    promises.push(download(browser, link, output, destinationFilename));
  }

  await Promise.all(promises);
  await browser.close();
}

async function download(
  browser: puppeteer.Browser,
  link: string,
  outputDir: string,
  destinationFilename: string
): Promise<void> {
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0);
    
  const client = await page.target().createCDPSession();
  await client.send("Fetch.enable", {
    patterns: [
      {
        requestStage: "Response"
      }
    ]
  });
  let onRequestPaused: (e: any) => void;
  const promise = new Promise<void>(resolve => {
    onRequestPaused = async e => {
      if (e.request.url === link) {
        try {
          const response = (await client.send("Fetch.getResponseBody", {
            requestId: e.requestId
          })) as any;
          await writeFileAsync(
            join(outputDir, destinationFilename),
            response.body,
            "base64"
          );
          console.log(`Saved to ${destinationFilename}.`);
          resolve();
        } catch (e) {
          // Don't fail other downloads.
          console.error(`Failed to save ${destinationFilename}.`, e);
        }
      }
      await client.send("Fetch.continueRequest", e);
    };
  });
  await client.on("Fetch.requestPaused", onRequestPaused!);
  await page.goto(link);
  return promise;
}
