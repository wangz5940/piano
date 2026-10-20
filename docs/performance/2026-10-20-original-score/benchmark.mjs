const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const [base = "https://101.96.229.102", label = "before", count = "3"] = process.argv.slice(2);
const readingMs=Number(process.argv[5]??0);
const out = `/tmp/panio-original-${label}`;
mkdirSync(out, { recursive: true });
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const results = existsSync(`${out}/browser.json`) ? JSON.parse(readFileSync(`${out}/browser.json`,"utf8")) : [];
let visitCookies=[];
try {
for (const mobile of [false, true]) {
  for (const example of [cases[0], cases[1], cases[4]]) {
    for (let sample = 1; sample <= Number(count); sample++) {
      if(results.some(r=>r.mobile===mobile && r.title===example.title && r.sample===sample && r.mode==="warm")) continue;
      const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1440,height:1000}, isMobile:mobile, hasTouch:mobile, deviceScaleFactor:1 });
      await context.addCookies(visitCookies);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", e => {if(e.type()==="error") errors.push(e.text().slice(0,500));});
      page.on("requestfailed", r => errors.push(`${r.url()} ${r.failure()?.errorText}`));
      await page.addInitScript(() => {
        window.__original = {click:0, ready:0, parses:[], serializes:[], long:[]};
        new PerformanceObserver(list => {
          window.__original.long.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})));
        }).observe({type:"longtask",buffered:true});
        const parse = DOMParser.prototype.parseFromString;
        DOMParser.prototype.parseFromString = function(...args) {
          const start = performance.now(); const result = parse.apply(this,args);
          window.__original.parses.push({start,duration:performance.now()-start,bytes:args[0].length});
          return result;
        };
        const serialize = XMLSerializer.prototype.serializeToString;
        XMLSerializer.prototype.serializeToString = function(...args) {
          const start = performance.now(); const result = serialize.apply(this,args);
          window.__original.serializes.push({start,duration:performance.now()-start,bytes:result.length});
          return result;
        };
        document.addEventListener("click", e => {
          if(e.target.closest("button")?.textContent.trim()!=="原谱") return;
          window.__original.click=performance.now();
          window.__original.ready=0;
          const check = () => {
            const host=document.querySelector(".jianpu-original-score-host");
            if (!host?.querySelector("svg") || host.closest("[hidden]") || document.querySelector(".jianpu-original-score .jianpu-score-state")) return false;
            requestAnimationFrame(()=>requestAnimationFrame(()=>window.__original.ready=performance.now()));
            return true;
          };
          if (check()) return;
          const observer=new MutationObserver(()=>{if(check())observer.disconnect();});
          observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
        },true);
      });
      const navStart=Date.now();
      await page.goto(base+example.route);
      try {
        await page.locator(".textbook-jianpu-score").first().waitFor();
      } catch(error) {
        console.log(await page.locator("main").innerText(),errors);
        throw error;
      }
      const navigationMs=Date.now()-navStart;
      // Fixed user think time is a benchmark condition, not a page readiness check.
      if(readingMs){
        await page.getByRole("button",{name:"原谱",exact:true}).scrollIntoViewIfNeeded();
        await page.waitForTimeout(readingMs);
      }
      const cdp=await context.newCDPSession(page);
      const profile = sample===1 && !mobile && example===cases[4];
      if(profile){ await cdp.send("Profiler.enable"); await cdp.send("Profiler.start"); }
      for(const mode of ["cold","warm"]) {
        if(mode==="warm") {
          await page.getByRole("button",{name:"简谱",exact:true}).click();
          await page.locator(".textbook-jianpu-score").first().waitFor();
        }
        await page.getByRole("button",{name:"原谱",exact:true}).click();
        try {
          await page.waitForFunction(()=>window.__original.ready>window.__original.click,{},{timeout:20000});
        } catch(error) {
          console.log(await page.evaluate(()=>({state:document.querySelector(".jianpu-original-score")?.textContent?.slice(0,500),debug:window.__original})));
          console.log({errors});
          await page.screenshot({path:`${out}/failure.png`});
          if(profile) writeFileSync(`${out}/failure.cpuprofile`,JSON.stringify((await cdp.send("Profiler.stop")).profile));
          throw error;
        }
        const ready = await page.evaluate(()=> {
          const d=window.__original;
          const host=document.querySelector(".jianpu-original-score-host");
          return {
            clickMs:d.click, readyMs:d.ready, clickToPaintMs:d.ready-d.click,
            resources:performance.getEntriesByType("resource").filter(e=>e.startTime>=d.click-5).map(e=>({url:new URL(e.name).pathname,start:e.startTime-d.click,end:e.responseEnd-d.click,ttfb:e.responseStart-e.startTime,bytes:e.encodedBodySize,transfer:e.transferSize})),
            preClickResources:performance.getEntriesByType("resource").filter(e=>e.startTime<d.click-5 && /opensheetmusicdisplay|musicxml/.test(e.name)).map(e=>({url:new URL(e.name).pathname,start:e.startTime-d.click,end:e.responseEnd-d.click,bytes:e.encodedBodySize,transfer:e.transferSize})),
            parses:d.parses.filter(e=>e.start>=d.click),
            serializes:d.serializes.filter(e=>e.start>=d.click),
            longTasks:d.long.filter(e=>e.start>=d.click),
            svg:host.querySelectorAll("svg").length, paths:host.querySelectorAll("path").length,
            notes:host.querySelectorAll(".vf-stavenote").length,
            text:host.querySelector("svg")?.textContent,
            width:host.getBoundingClientRect().width,height:host.getBoundingClientRect().height,
            stages:performance.getEntriesByType("measure").filter(e=>e.name.startsWith("panio:original")).map(e=>({name:e.name,duration:e.duration})),
          };
        });
        await page.locator(".jianpu-original-score").getByRole("button",{name:"放大谱面",exact:true}).click();
        await page.locator(".jianpu-original-score output").filter({hasText:"108%"}).waitFor();
        const interactiveMs=await page.evaluate(()=>performance.now()-window.__original.click);
        await page.locator(".jianpu-original-score").getByRole("button",{name:"缩小谱面",exact:true}).click();
        await page.locator(".jianpu-original-score output").filter({hasText:"100%"}).waitFor();
        if (sample===1 && mode==="cold") await page.screenshot({path:`${out}/${mobile?"mobile":"desktop"}-${example.id}.png`});
        results.push({base,label,mobile,sample,title:example.title,route:example.route,measures:example.measures,mode,readingMs,navigationMs,interactiveMs,...ready,errors:[...errors]});
        writeFileSync(`${out}/browser.json`,JSON.stringify(results,null,2));
        console.log(JSON.stringify({mobile,sample,title:example.title,mode,ms:Math.round(ready.clickToPaintMs),interactiveMs:Math.round(interactiveMs),svg:ready.svg,notes:ready.notes,errors:errors.length}));
      }
      if(profile) writeFileSync(`${out}/large.cpuprofile`,JSON.stringify((await cdp.send("Profiler.stop")).profile));
      visitCookies=(await context.cookies()).filter(c=>c.name==="panio_visit");
      await context.close();
    }
  }
}
} finally {await browser.close();}
