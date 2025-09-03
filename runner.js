const fs = require("fs");
const path = require("path");
const axios = require("axios");

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node runner.js <scenario.json> <baseUrl> [--report <dir>] [--fuzz <n>]");
  process.exit(1);
}
const scenarioPath = args[0];
const baseUrl = args[1].replace(/\/+$/, "");
const reportDir = (() => {
  const i = args.indexOf("--report");
  return i >= 0 ? args[i+1] : `reports/${Date.now()}`;
})();
const fuzzCount = (() => {
  const i = args.indexOf("--fuzz");
  return i >= 0 ? parseInt(args[i+1], 10) : 0;
})();

fs.mkdirSync(reportDir, { recursive: true });

const saveJSON = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2));
const toCSVRow = (arr) => arr.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",");
const getPath = (obj, dotPath) => dotPath.split(".").reduce((o,k)=> (o==null?undefined:o[k]), obj);
const setVars = (str, ctx) => String(str).replace(/{{(.*?)}}/g, (_, k) => (ctx[k] ?? ""));
const deepTemplate = (val, ctx) => {
  if (val == null) return val;
  if (typeof val === "string") return setVars(val, ctx);
  if (Array.isArray(val)) return val.map(v => deepTemplate(v, ctx));
  if (typeof val === "object") {
    const out = {};
    for (const [k,v] of Object.entries(val)) out[k] = deepTemplate(v, ctx);
    return out;
  }
  return val;
};
const randStr = (n=8)=>Math.random().toString(36).slice(2,2+n);

function checkExpect(expect, res) {
  let ok = true;
  const notes = [];

  if (expect?.status != null) {
    const pass = Array.isArray(expect.status)
      ? expect.status.includes(res.status)
      : res.status === expect.status;
    ok = ok && pass;
    notes.push(`status:${res.status}${pass?"✓":"✗"}`);
  }

  if (expect?.body) {
    for (const [p, want] of Object.entries(expect.body)) {
      if (p === "exists" || p === "notExists") continue;
      const got = getPath(res.data, p);
      let pass;
      if (typeof want === "string" && /^\/.*\/$/.test(want)) {
        pass = new RegExp(want.slice(1, -1)).test(String(got));
      } else {
        pass = (JSON.stringify(got) === JSON.stringify(want));
      }
      ok = ok && pass;
      notes.push(`${p}=${JSON.stringify(got)} ${pass?"✓":"✗"}`);
    }
    if (Array.isArray(expect.body.exists)) {
      for (const p of expect.body.exists) {
        const got = getPath(res.data, p);
        const pass = got !== undefined;
        ok = ok && pass;
        notes.push(`exists:${p}${pass?"✓":"✗"}`);
      }
    }
    if (Array.isArray(expect.body.notExists)) {
      for (const p of expect.body.notExists) {
        const got = getPath(res.data, p);
        const pass = got === undefined;
        ok = ok && pass;
        notes.push(`notExists:${p}${pass?"✓":"✗"}`);
      }
    }
  }
  return { ok, notes: notes.join("; ") };
}

async function runStep(step, ctx, label) {
  const reqBody = deepTemplate(step.body || {}, ctx);
  const reqHeaders = deepTemplate(step.headers || {}, ctx);
  const url = baseUrl + setVars(step.url, ctx);

  const startedAt = Date.now();
  let res, errOut;
  try {
    res = await axios({
      method: step.method,
      url,
      data: reqBody,
      headers: reqHeaders,
      validateStatus: () => true
    });
  } catch (e) {
    errOut = { message: e.message, stack: e.stack };
  }
  const endedAt = Date.now();

  const meta = {
    id: step.id,
    label,
    request: { method: step.method, url, headers: reqHeaders, body: reqBody },
    response: res ? { status: res.status, data: res.data } : null,
    error: errOut || null,
    ms: endedAt - startedAt
  };

  if (res && step.save) {
    for (const [k, p] of Object.entries(step.save)) {
      ctx[k] = p.startsWith("header.")
        ? res.headers[p.slice(7)]
        : getPath(res.data, p.replace(/^json\./,""));
    }
  }

  let pass = false, notes = "no assertions";
  if (res && step.expect) {
    const r = checkExpect(step.expect, res);
    pass = r.ok; notes = r.notes;
  } else if (!res) {
    notes = errOut?.message || "request failed";
  }

  const outFile = path.join(reportDir, `${step.id || label}.json`);
  saveJSON(outFile, meta);
  return { pass, notes, status: res?.status, outFile };
}

(async () => {
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
  const ctx = {};
  const summaryRows = [["TestID","Description","Status","HTTP","Notes","Evidence"]];

  for (const step of scenario) {
    const times = (fuzzCount > 0 && step.fuzz) ? (1 + fuzzCount) : 1;
    for (let i=0; i<times; i++) {
      if (i>0 && step.fuzz && step.body) {
        const mutated = JSON.parse(JSON.stringify(step.body), (k,v)=>{ 
          if (typeof v === "string") return v.replace(/FZZ/g, randStr());
          return v;
        });
        step.__mut = mutated;
      } else {
        delete step.__mut;
      }

      const runLabel = step.id + (i>0?`_f${i}`:"");
      const runStepObj = {
        ...step,
        body: step.__mut ?? step.body
      };

      const { pass, notes, status, outFile } = await runStep(runStepObj, ctx, runLabel);
      console.log(`${pass?"PASS":"FAIL"} | ${runLabel} | ${status ?? "-"} | ${notes}`);
      summaryRows.push([runLabel, step.title || step.id, pass?"PASS":"FAIL", status ?? "-", notes, outFile]);
    }
  }

  fs.writeFileSync(path.join(reportDir, "summary.csv"),
    summaryRows.map(r => toCSVRow(r)).join("\n"));
  console.log(`\nReport: ${reportDir}/summary.csv`);
})();
