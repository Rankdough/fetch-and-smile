const $ = (id) => document.getElementById(id);
const FIELDS = ["title", "priority", "status", "effort", "team", "tag", "type", "section", "ticket_id",
  "checklist_ref", "month", "due", "whats_wrong", "why_it_matters", "what_well_do", "detail", "evidence"];
const touched = new Set();
const msg = (text, cls = "") => { $("status_msg").textContent = text; $("status_msg").className = cls; };

async function config() {
  const c = await chrome.storage.sync.get(["endpoint", "secret", "lastProject"]);
  if (!c.endpoint || !c.secret) { msg("Set the endpoint and secret in Options first.", "err"); throw new Error("not configured"); }
  return c;
}

// Runs inside the page.
function readPage() {
  const sel = String(window.getSelection() || "").trim();
  const root = document.querySelector("main, article") || document.body;
  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || "";
  return {
    pageTitle: document.title, url: location.href, selection: sel,
    description: meta("description"), h1: document.querySelector("h1")?.innerText.trim() || "",
    text: (sel || root.innerText.trim()).slice(0, 6000),
  };
}

const RULES = {
  type: [[/\b(broken|404|error|missing|duplicate|wrong|fix|bug|redirect)\b/i, "Fix"],
         [/\b(build|create|add|launch|implement)\b/i, "Build"], [/\b(research|compare|analy[sz]e|audit)\b/i, "Research"]],
  tag: [[/\b(schema|canonical|robots|sitemap|speed|core web vitals|crawl|index|redirect|404|hreflang)\b/i, "Technical"],
        [/\b(backlink|link building|anchor|referring)\b/i, "Links"], [/\b(analytics|ga4|tracking|tag manager|conversion)\b/i, "Analytics"],
        [/\b(design|layout|ux|button|mobile)\b/i, "Design"], [/\b(title|meta|heading|blog|copy|content|keyword)\b/i, "Content"]],
  priority: [[/\b(critical|urgent|outage|down|broken|404|noindex)\b/i, "urgent"], [/\b(important|high|major)\b/i, "high"]],
};
const first = (rules, text, dflt) => (rules.find(([re]) => re.test(text)) || [, dflt])[1];

function heuristic(p) {
  const blob = `${p.pageTitle} ${p.selection} ${p.description}`;
  const due = new Date(); due.setDate(due.getDate() + 14);
  return {
    title: p.selection ? p.selection.split(/\n|\. /)[0].slice(0, 120) : p.h1 || p.pageTitle,
    priority: first(RULES.priority, blob, "medium"), status: "not_started", effort: "2",
    team: "Client", tag: first(RULES.tag, blob, "Other"), type: first(RULES.type, blob, "Fix"),
    section: p.h1 || p.pageTitle, month: due.toLocaleString("en-GB", { month: "short", year: "numeric" }),
    due: due.toISOString().slice(0, 10),
    whats_wrong: p.selection.slice(0, 500),
    evidence: `${p.url}\n\n${p.selection ? "Selected text" : "Page excerpt"}:\n${p.text.slice(0, 1200)}`,
  };
}

function fill(values, onlyUntouched = true) {
  for (const k of FIELDS) {
    const v = values[k];
    if (v === undefined || v === null || v === "") continue;
    if (onlyUntouched && touched.has(k)) continue;
    $(k).value = String(v);
  }
  updateMeta();
}

function updateMeta() {
  const eff = $("effort").selectedOptions[0]?.text;
  $("meta").textContent = [$("status").selectedOptions[0].text, $("priority").selectedOptions[0].text,
    `Effort ${$("effort").value}`, $("team").value, $("due").value && `Due ${$("due").value}`].filter(Boolean).join(" · ");
  void eff;
}

async function call(c, body) {
  const res = await fetch(c.endpoint, {
    method: "POST", headers: { "Content-Type": "application/json", "x-extension-secret": c.secret }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function init() {
  for (const k of FIELDS) $(k).addEventListener("input", () => { touched.add(k); updateMeta(); });
  const c = await config();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });

  fill(heuristic(page), false);
  $("ai").textContent = "Guessing fields...";

  const res = await fetch(c.endpoint, { headers: { "x-extension-secret": c.secret } });
  if (res.ok) {
    const { projects } = await res.json();
    for (const p of projects) $("project").add(new Option(p.name, p.id));
    if (c.lastProject) $("project").value = c.lastProject;
  } else msg(`Could not load projects (HTTP ${res.status}).`, "err");

  try {
    const { suggestion } = await call(c, { action: "suggest", url: page.url, page_title: page.pageTitle, text: page.text });
    fill({ ...suggestion, effort: String(suggestion.effort || "") });
    $("ai").textContent = "Fields guessed by AI. Check before saving.";
  } catch {
    $("ai").textContent = "AI guess unavailable. Using page rules.";
  }
}

$("create").addEventListener("click", async () => {
  try {
    const c = await config();
    msg("Creating...");
    const body = { project_id: $("project").value, due_date: $("due").value || undefined };
    for (const k of FIELDS) if (k !== "due") body[k] = $(k).value;
    await call(c, body);
    await chrome.storage.sync.set({ lastProject: $("project").value });
    msg("Ticket created.", "ok");
  } catch (e) { if (e.message !== "not configured") msg(`Failed: ${e.message}`, "err"); }
});

init().catch((e) => e.message !== "not configured" && msg(e.message, "err"));
