// Rasterize an SVG card to PNG for a quick look: npx tsx scripts/preview.ts card.svg
// (resvg ignores the SMIL shine animation, so the PNG is the resting frame.)
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const [input = "fullpitch-card.svg", output = input.replace(/\.svg$/, ".png")] = process.argv.slice(2);
const png = new Resvg(readFileSync(input, "utf8"), { fitTo: { mode: "zoom", value: 1 } }).render().asPng();
writeFileSync(output, png);
console.log(`preview → ${output}`);
