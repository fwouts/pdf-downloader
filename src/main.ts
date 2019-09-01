import axios from "axios";
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
    headless: true
  });

  const page = await browser.newPage();
  await page.goto(url);

  const linkElements = await page.$$("a");
  const downloads: Promise<void>[] = [];
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
    downloads.push(download(output, link, title));
  }

  await browser.close();
  await Promise.all(downloads);
}

async function download(output: string, link: string, title: string) {
  const destinationFilename = sanitize(`${title}.pdf`, { replacement: "-" });
  console.log(`Downloading ${destinationFilename}...`);
  try {
    const response = await axios.get(link);
    await writeFileAsync(
      join(output, destinationFilename),
      response.data,
      "utf8"
    );
    console.log(`Successfully downloaded ${destinationFilename}.`);
  } catch (e) {
    console.error(`Failed to download ${destinationFilename}.`);
  }
}
