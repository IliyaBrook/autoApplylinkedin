
function changeAutoApplyButton(isRunning, selector) {
  const startIcon = document.getElementById("start-icon");
  const runningIcon = document.getElementById("running-icon");

  if (isRunning) {
    selector.classList.add("running");
    selector.textContent = "Stop Auto Apply";
    if (startIcon) startIcon.style.display = "none";
    if (runningIcon) runningIcon.style.display = "inline";
  } else {
    selector.classList.remove("running");
    selector.textContent = "Start Auto Apply";
    if (startIcon) startIcon.style.display = "inline";
    if (runningIcon) runningIcon.style.display = "none";
  }
}

const getCurrentUrl = () => {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "getCurrentUrl" },
          (response) => {
            const url = response?.url;
            if (!url?.includes("linkedin.com/jobs")) {
              alert(
                "Saved is only available on the LinkedIn jobs search page."
              );
              resolve(false);
            }
            resolve(response.url);
          }
        );
      } else {
        reject("Active tab not found");
      }
    });
  });
};


let editingLinkName = null;

function openLinkModal({ edit = false, name = "", url = "" } = {}) {
  document.getElementById("linkModalOverlay").style.display = "flex";
  document.getElementById("linkModalTitle").textContent = edit
    ? "Edit job search link"
    : "Add job search link";
  document.getElementById("linkNameInput").value = name;
  document.getElementById("linkUrlInput").value = url;
  editingLinkName = edit ? name : null;
}
function closeLinkModal() {
  document.getElementById("linkModalOverlay").style.display = "none";
  document.getElementById("linkNameInput").value = "";
  document.getElementById("linkUrlInput").value = "";
  editingLinkName = null;
}
document.getElementById("cancelLinkModalBtn").onclick = closeLinkModal;
document.getElementById("linkModalOverlay").onclick = function (e) {
  if (e.target === this) closeLinkModal();
};

document.getElementById("save-link").onclick = function () {
  getCurrentUrl().then((url) => {
    if (!url) return;
    openLinkModal({ edit: false, name: "", url });
  });
};
document.getElementById("saveLinkModalBtn").onclick = function () {
  const name = document.getElementById("linkNameInput").value.trim();
  const url = document.getElementById("linkUrlInput").value.trim();
  if (!name || !url) {
    alert("Both name and URL are required.");
    return;
  }
  chrome.storage.local.get("savedLinks", (result) => {
    const savedLinks = result.savedLinks || {};
    if (editingLinkName && editingLinkName !== name && name in savedLinks) {
      alert("Link name already exists.");
      return;
    }
    if (!editingLinkName && name in savedLinks) {
      alert("Link name already exists.");
      return;
    }
    if (!editingLinkName && Object.values(savedLinks).includes(url)) {
      alert("Link already exists.");
      return;
    }
    if (editingLinkName) {

      const updatedLinks = { ...savedLinks };
      if (editingLinkName !== name) delete updatedLinks[editingLinkName];
      updatedLinks[name] = url;
      chrome.storage.local.set({ savedLinks: updatedLinks }, () => {
        closeLinkModal();
        renderSavedLinks();
      });
    } else {

      chrome.storage.local.set(
        { savedLinks: { ...savedLinks, [name]: url } },
        () => {
          closeLinkModal();
          renderSavedLinks();
        }
      );
    }
  });
};

function renderSavedLinks() {
  const accordion = document.getElementById("linksAccordion");
  if (!accordion) return;
  const content = accordion.querySelector(".accordion-content");
  chrome.storage.local.get("savedLinks", (result) => {
    const savedLinks = result.savedLinks || {};
    content.innerHTML = "";
    if (Object.keys(savedLinks).length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.textContent = "No saved links available.";
      content.appendChild(emptyMsg);
      return;
    }
    Object.entries(savedLinks).forEach(([name, url]) => {
      const item = document.createElement("div");
      item.className = "saved-link-item";
      const nameEl = document.createElement("span");
      nameEl.textContent = name;
      item.appendChild(nameEl);

      const goBtn = document.createElement("button");
      goBtn.className = "icon-btn go-btn";
      goBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
      goBtn.title = "Go";
      goBtn.onclick = () => {
        chrome.runtime.sendMessage(
          { action: "openTabAndRunScript", url }
        );
      };
      item.appendChild(goBtn);

      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn edit-btn";
      editBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.46v3.04c0 .28.22.5.5.5h3.04c.13 0 .26-.05.35-.15L17.81 9.94l-3.75-3.75L3.15 17.1c-.1.1-.15.22-.15.36zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      editBtn.title = "Edit";
      editBtn.onclick = () => {
        openLinkModal({ edit: true, name, url });
      };
      item.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn delete-btn";
      delBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>';
      delBtn.title = "Delete";
      delBtn.onclick = () => {
        chrome.storage.local.get("savedLinks", (res) => {
          const links = res.savedLinks || {};
          delete links[name];
          chrome.storage.local.set({ savedLinks: links }, () => {
            renderSavedLinks();
          });
        });
      };
      item.appendChild(delBtn);
      content.appendChild(item);
    });
  });
}

document.addEventListener("click", (event) => {
  if (event.target.tagName === "BUTTON") {
    const buttonId = event.target.id;
    const button = document.getElementById(buttonId);
    switch (buttonId) {


      case "external-apply-button":
        chrome.tabs.create({ url: "/popup/externalApply/externalApply.html" });
        break;
      case "settings-button":
        chrome.tabs.create({ url: "/popup/settings/settings.html" });
        break;


      case "save-link":

        break;

      case "show-links":
        try {
          let accordion = document.getElementById("linksAccordion");

          const dataset = button.dataset;
          if (dataset.open === "true") {
            button.textContent = "Show job search links";
            button.style.backgroundColor = "rgb(9, 2, 214, 0.8)";
            button.dataset.open = "false";
            if (accordion) {
              accordion.style.display = "none";
            }
          } else {
            button.dataset.open = "true";
            button.textContent = "Hide job search link";
            button.style.backgroundColor = "rgb(220,53,69)";

            if (accordion) {
              accordion.style.display = "block";
            }
          }
          if (!accordion) {
            if (dataset.open === "true") {
              accordion = document.createElement("div");
              accordion.id = "linksAccordion";
              accordion.style.border = "1px solid #ccc";
              accordion.style.marginTop = "10px";
              accordion.style.padding = "10px";
              accordion.style.background = "#f9f9f9";
              accordion.style.borderRadius = "4px";
              const content = document.createElement("div");
              content.className = "accordion-content";
              content.style.display = "block";
              accordion.appendChild(content);
              const linksRow = document.querySelector(".links-buttons-row");
              linksRow.parentNode.insertBefore(accordion, linksRow.nextSibling);
            }
          }
          if (accordion && dataset.open === "true") {
            renderSavedLinks();
          }
        } catch (error) {
          console.error("Cannot show links case 'show-links'", error);
        }
        break;
      case "start-auto-apply-button":
        if (
          typeof chrome !== "undefined" &&
          chrome?.storage &&
          chrome?.storage.local
        ) {
          chrome.storage.local.get(
            "autoApplyRunning",
            ({ autoApplyRunning }) => {
              const newState = !autoApplyRunning;
              changeAutoApplyButton(newState, button);
              chrome.tabs.query(
                { active: true, currentWindow: true },
                (tabs) => {
                  const noActiveTabsText =
                    "No active tabs found try to go to a LinkedIn job search page or refresh the page.";
                  if (tabs && tabs?.length > 0) {
                    const currentTabId = tabs?.[0].id;
                    chrome.runtime.sendMessage(
                      {
                        action: newState ? "startAutoApply" : "stopAutoApply",
                        tabId: currentTabId,
                      },
                      (response) => {
                        if (response?.success) {
                          chrome.storage.local.set({
                            autoApplyRunning: newState,
                          });
                        } else {
                          chrome.storage.local.set(
                            { autoApplyRunning: false },
                            () => {
                              changeAutoApplyButton(false, button);
                              if (
                                response?.message === "No active tab found."
                              ) {
                                alert(noActiveTabsText);
                              }
                            }
                          );
                        }
                      }
                    );
                  } else {
                    alert(noActiveTabsText);
                  }
                }
              );
            }
          );
        }
    }
  }
});



document.addEventListener("DOMContentLoaded", () => {
  const autoApplyButton = document.getElementById("start-auto-apply-button");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      const currentTabId = tabs[0].id;
      chrome.runtime.sendMessage(
        {
          action: "checkAutoApplyStatus",
          tabId: currentTabId,
        },
        (response) => {
          const isRunning = response?.isRunning || false;
          chrome.storage.local.set({ autoApplyRunning: isRunning }, () => {
            changeAutoApplyButton(isRunning, autoApplyButton);
          });
        }
      );
    } else {
      chrome.storage.local.get("autoApplyRunning", ({ autoApplyRunning }) => {
        changeAutoApplyButton(autoApplyRunning || false, autoApplyButton);
      });
    }
  });


});

