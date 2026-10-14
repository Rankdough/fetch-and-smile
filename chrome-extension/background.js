// Right-click selected text -> open the popup so the ticket can be reviewed before creation.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "rd-ticket", title: "Create Rankdough ticket from selection", contexts: ["selection"] });
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "rd-ticket") chrome.action.openPopup();
});
