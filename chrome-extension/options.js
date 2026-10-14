const $ = (id) => document.getElementById(id);
chrome.storage.sync.get(["endpoint", "secret"]).then((c) => {
  $("endpoint").value = c.endpoint || "";
  $("secret").value = c.secret || "";
});
$("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({ endpoint: $("endpoint").value.trim(), secret: $("secret").value });
  $("saved").textContent = "Saved.";
});
