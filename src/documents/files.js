import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Render privately first. A failed render must not leave a corrupt file in
// Downloads, and independent writers must never overwrite each other's output.
export async function publishDocument(directory, filename, write) {
  await fs.promises.mkdir(directory,{recursive:true});
  const staging = path.join(directory,`.oproxy-${randomUUID()}.partial`);
  try {
    await write(staging);
    const size = (await fs.promises.stat(staging)).size;
    if (!size) throw new Error("文档生成结果为空，请重试。");
    const extension=path.extname(filename), base=path.basename(filename,extension);
    for(let index=0;;index++) {
      const destination=path.join(directory,index?`${base} (${index})${extension}`:filename);
      try {
        // Hard linking is atomic and refuses EEXIST, including for symlinks.
        await fs.promises.link(staging,destination);
        return destination;
      } catch(error) { if(error.code!=="EEXIST")throw error; }
    }
  } finally { await fs.promises.rm(staging,{force:true}).catch(()=>{}); }
}
