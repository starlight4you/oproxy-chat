// Developer-only renderer: reproduce a saved model spec with the app's bundled engine.
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createDocumentEngine } from "../src/documents/engine.js";
import { writePdf, renderSvgImage } from "../src/export.js";
app.on("window-all-closed",()=>{});
app.whenReady().then(async()=>{
  try {
    const [input, directory] = process.argv.slice(2);
    if(!input || !directory)throw Error("Usage: electron scripts/render-document.mjs spec.json output-directory");
    const engine=createDocumentEngine({directory:path.resolve(directory),renderPdf:writePdf,renderSvg:renderSvgImage});
    console.log(JSON.stringify(await engine.generateDocument(JSON.parse(fs.readFileSync(input,"utf8")))));
    app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
});
