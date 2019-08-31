import axios from "axios";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import puppeteer from "puppeteer";
import yargs from "yargs";

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
    const destinationFilename = `${title}.pdf`;
    console.log(`Downloading ${destinationFilename}...`);
    const response = await axios.get(link);
    writeFileSync(join(output, destinationFilename), response.data, "utf8");
    console.log(`Successfully downloaded ${destinationFilename}.`);
  }

  await browser.close();
}
