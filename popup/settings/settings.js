
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("form-control-button").addEventListener("click", () => {
    chrome.tabs.create({ url: "/popup/formControl/formControl.html" });
  });

  document.getElementById("filter-settings-button").addEventListener("click", () => {
    chrome.tabs.create({ url: "/popup/filterSettings/filterSettings.html" });
  });

  document.getElementById("cv-files-button").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup/cvManager/cvManager.html") });
  });

  document.getElementById("export-button").addEventListener("click", () => {
    chrome.storage.local.get(null, function (data) {
      const jsonData = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonData], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      
      let timeStr = "backup";
      if (typeof getTime === "function") {
        const { day, hour, minute, month } = getTime();
        timeStr = `${day}_${month}_[${hour}_${minute}]`;
      } else {
        const now = new Date();
        timeStr = `${now.getDate()}_${now.getMonth() + 1}_[${now.getHours()}_${now.getMinutes()}]`;
      }
      
      link.download = `autoapply_settings_${timeStr}.json`;
      link.click();

      URL.revokeObjectURL(url);
    });
  });

  document.getElementById("import-button").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });

  document.getElementById("import-file").addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        if (e?.target?.result && typeof e.target.result === "string") {
          const importedData = JSON.parse(e.target.result);
          chrome.storage.local.set(importedData, function () {
            alert("Settings imported successfully!");
          });
        } else {
          alert("Error reading file.");
        }
      } catch (err) {
        alert("Parsing error JSON. " + err);
      }
    };
    reader.readAsText(file);
  });


});
