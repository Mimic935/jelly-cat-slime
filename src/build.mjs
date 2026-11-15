import {readFileSync,writeFileSync} from "node:fs";
import {extname} from "node:path";
import {fileURLToPath} from "node:url";
import {Script} from "node:vm";
process.chdir(fileURLToPath(new URL(".",import.meta.url)));
const catalog = JSON.parse(readFileSync("templates.json", "utf8"));
const templates = {};
for (const [id, { asset, ...definition }] of Object.entries(catalog)) {
  const encoded = readFileSync(asset).toString("base64");
  templates[id] = { ...definition, src:"data:image/" + extname(asset).slice(1) + ";base64," + encoded };
}
const patch=function patch(html){
 html=html.replace(/\r\n/g,"\n");
 function rep(a,b){if(html.split(a).length!==2)throw Error("Unexpected marker: "+a);html=html.replace(a,()=>b)}
 rep('<html lang="zh-CN" data-flavor="berry">','<html lang="zh-CN" data-flavor="berry" data-jelly-view="entry">');
 rep("</style>",readFileSync("entry.css","utf8")+"\n</style>");
 rep("/* TEMPLATE_CATALOG */ {}",JSON.stringify(templates));
 let entry = readFileSync("entry.html","utf8");
 for (const layer of ["ribbons", "doodles", "cat"]) {
   const encoded = readFileSync("entry-assets/" + layer + ".webp").toString("base64");
   entry = entry.replace("__ENTRY_" + layer.toUpperCase() + "__", "data:image/webp;base64," + encoded);
 }
 rep("</header>\n", `</header>
<nav class="frame studio-nav" aria-label="站点导航">
  <a href="#studio" aria-current="page">创作台</a>
</nav>
`);
 rep('<header class="frame masthead">',entry+'\n<header class="frame masthead">');
 rep('})();\n</script>',readFileSync("entry-jelly.js","utf8")+readFileSync("entry-client.js","utf8")+'\n})();\n</script>');
 return html;
};
const page=patch(readFileSync("studio.html","utf8"));
new Script(page.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
writeFileSync("../index.html",page);

