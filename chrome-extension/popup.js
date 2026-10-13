const $ = (id) => document.getElementById(id);
const status = (msg, cls = "") => { $("status").textContent = msg; $("status").className = cls; };

async function config() {
  const c = await chrome.storage.sync.get(["endpoint", "secret", "lastProject"]);
  if (!c.endpoint || !c.secret) {
    status("Set the endpoint and secret in Options first.", "err");
    throw new Error("not configured");
  }
  return c;
}

function pageContent() {
  const sel = String(window.getSelection() || "").trim();
  const body = sel || (document.querySelector("main, article") || document.body).innerText.trim().slice(0, 4000);
  return { title: document.title, url: location.href, text: body, isSelection: !!sel };
}

async function init() {
  const c = await config();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageContent });
  $("title").value = page.title;
  $("description").value = `Source: ${page.url}\n\n${page.isSelection ? "Selected text" : "Page excerpt"}:\n${page.text}`;

  const res = await fetch(c.endpoint, { headers: { "x-extension-secret": c.secret } });
  if (!res.ok) return status(`Could not load projects (${res.status}).`, "err");
  const { projects } = await res.json();
  for (const p of projects) $("project").add(new Option(p.name, p.id));
  if (c.lastProject) $("project").value = c.lastProject;
}

$("create").addEventListener("click", async () => {
  try {
    const c = await config();
    status("Creating...");
    const res = await fetch(c.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-extension-secret": c.secret },
      body: JSON.stringify({
        project_id: $("project").value,
        title: $("title").value,
        description: $("description").value,
        priority: $("priority").value || undefined,
        due_date: $("due").value || undefined,
      }),
    });
    if (!res.ok) return status(`Failed (${res.status}).`, "err");
    await chrome.storage.sync.set({ lastProject: $("project").value });
    status("Ticket created.", "ok");
  } catch (e) { if (e.message !== "not configured") status(e.message, "err"); }
});

init().catch((e) => e.message !== "not configured" && status(e.message, "err"));
