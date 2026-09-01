document.addEventListener("DOMContentLoaded", () => {
  let currentShare = null;
  let currentPath = "";
  let currentItems = [];               // items in the currently rendered folder
  let pendingDeleteItems = [];         // [{path, is_dir, name}] queued for the delete modal
  const selectedPaths = new Map();     // subpath -> {path, is_dir, name}
  let clipboard = null;                // {mode:"copy"|"cut", share, items:[{path,is_dir,name}]}

  // DOM Elements
  const loginSection = document.getElementById("loginSection");
  const portalSection = document.getElementById("portalSection");
  const sharesView = document.getElementById("sharesView");
  const explorerView = document.getElementById("explorerView");
  const storageCard = document.getElementById("storageCard");
  const storageShareLabel = document.getElementById("storageShareLabel");
  const storageDetails = document.getElementById("storageDetails");
  const storageBarFill = document.getElementById("storageBarFill");
  const storagePercent = document.getElementById("storagePercent");

  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const navHome = document.getElementById("navHome");
  const displayUser = document.getElementById("displayUser");

  const sharesContainer = document.getElementById("sharesContainer");
  const sharesLoading = document.getElementById("sharesLoading");
  const breadcrumbsContainer = document.getElementById("breadcrumbsContainer");
  const fileListBody = document.getElementById("fileListBody");
  const opStatus = document.getElementById("opStatus");

  const btnUploadModal = document.getElementById("btnUploadModal");
  const fileInput = document.getElementById("fileInput");
  const btnNewFolder = document.getElementById("btnNewFolder");

  const dropZone = document.getElementById("dropZone");
  const selectAllCheckbox = document.getElementById("selectAllCheckbox");

  const selectionToolbar = document.getElementById("selectionToolbar");
  const selectionCount = document.getElementById("selectionCount");
  const btnCopySel = document.getElementById("btnCopySel");
  const btnCutSel = document.getElementById("btnCutSel");
  const btnDeleteSel = document.getElementById("btnDeleteSel");
  const btnClearSel = document.getElementById("btnClearSel");

  const clipboardBar = document.getElementById("clipboardBar");
  const clipboardInfo = document.getElementById("clipboardInfo");
  const btnPaste = document.getElementById("btnPaste");
  const btnCancelClipboard = document.getElementById("btnCancelClipboard");

  // Preview Modal Elements
  const previewModal = document.getElementById("previewModal");
  const previewTitle = document.getElementById("previewTitle");
  const previewBody = document.getElementById("previewBody");
  const previewClose = document.getElementById("previewClose");

  // Delete Modal Elements
  const deleteModal = document.getElementById("deleteModal");
  const deleteStep1 = document.getElementById("deleteStep1");
  const deleteStep2 = document.getElementById("deleteStep2");
  const deleteItemName = document.getElementById("deleteItemName");
  const deleteConfirmInput = document.getElementById("deleteConfirmInput");
  const btnProceedDelete2 = document.getElementById("btnProceedDelete2");
  const btnFinalDelete = document.getElementById("btnFinalDelete");
  const btnCancelDelete1 = document.getElementById("btnCancelDelete1");
  const btnCancelDelete2 = document.getElementById("btnCancelDelete2");
  const deleteClose = document.getElementById("deleteClose");

  checkSession();

  navHome.addEventListener("click", () => {
    showSharesView();
    loadShares();
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.style.display = "none";
    loginBtn.disabled = true;
    loginBtn.innerText = "Authenticating...";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Authentication failed");
      }

      const data = await res.json();
      showPortal(data.username);
      loginForm.reset();
      loadShares();
    } catch (err) {
      loginError.innerText = err.message;
      loginError.style.display = "block";
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerText = "Sign In";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      showLogin();
    }
  });

  // ===================== Upload (button + drag & drop) =====================
  btnUploadModal.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => uploadFiles(e.target.files));

  ["dragenter", "dragover"].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
        dropZone.classList.add("dragover-active");
      }
    });
  });
  ["dragleave", "drop"].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      if (evt === "dragleave" && dropZone.contains(e.relatedTarget)) return;
      dropZone.classList.remove("dragover-active");
    });
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  async function uploadFiles(fileListLike) {
    const files = Array.from(fileListLike || []);
    if (!files.length) return;
    showStatus(`Uploading ${files.length} file(s)...`);

    for (const file of files) {
      const formData = new FormData();
      formData.append("share", currentShare);
      formData.append("path", currentPath);
      formData.append("file", file);

      try {
        const res = await fetch("/api/files/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || `Failed to upload ${file.name}`);
        }
      } catch (err) {
        showStatus(err.message, true);
        break;
      }
    }
    fileInput.value = "";
    showStatus(`Uploaded ${files.length} file(s) successfully.`);
    loadDirectory(currentShare, currentPath);
  }

  btnNewFolder.addEventListener("click", async () => {
    const name = prompt("Enter new folder name:");
    if (!name) return;
    try {
      const res = await fetch("/api/files/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: currentShare, path: currentPath, folder_name: name })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to create folder");
      }
      loadDirectory(currentShare, currentPath);
    } catch (err) {
      showStatus(err.message, true);
    }
  });

  // ===================== Selection (checkboxes) =====================
  selectAllCheckbox.addEventListener("change", () => {
    if (selectAllCheckbox.checked) {
      currentItems.forEach(item => {
        const subpath = itemSubpathOf(item);
        selectedPaths.set(subpath, { path: subpath, is_dir: item.is_dir, name: item.name });
      });
    } else {
      selectedPaths.clear();
    }
    renderFileList(currentItems);
    updateSelectionToolbar();
  });

  function toggleSelect(item, checked) {
    const subpath = itemSubpathOf(item);
    if (checked) {
      selectedPaths.set(subpath, { path: subpath, is_dir: item.is_dir, name: item.name });
    } else {
      selectedPaths.delete(subpath);
    }
    updateSelectionToolbar();
  }

  function updateSelectionToolbar() {
    const count = selectedPaths.size;
    selectionToolbar.style.display = count > 0 ? "flex" : "none";
    selectionCount.innerText = `${count} selected`;
    selectAllCheckbox.checked = count > 0 && count === currentItems.length;
  }

  btnClearSel.addEventListener("click", () => {
    selectedPaths.clear();
    renderFileList(currentItems);
    updateSelectionToolbar();
  });

  btnDeleteSel.addEventListener("click", () => {
    if (!selectedPaths.size) return;
    openDeleteModal(Array.from(selectedPaths.values()));
  });

  // ===================== Copy / Cut / Paste (clipboard) =====================
  btnCopySel.addEventListener("click", () => {
    if (!selectedPaths.size) return;
    clipboard = { mode: "copy", share: currentShare, items: Array.from(selectedPaths.values()) };
    updateClipboardBar();
  });

  btnCutSel.addEventListener("click", () => {
    if (!selectedPaths.size) return;
    clipboard = { mode: "cut", share: currentShare, items: Array.from(selectedPaths.values()) };
    updateClipboardBar();
  });

  btnCancelClipboard.addEventListener("click", () => {
    clipboard = null;
    updateClipboardBar();
  });

  btnPaste.addEventListener("click", async () => {
    if (!clipboard || !clipboard.items.length) return;
    const verb = clipboard.mode === "cut" ? "Moving" : "Copying";
    showStatus(`${verb} ${clipboard.items.length} item(s)...`);

    for (const item of clipboard.items) {
      const sourceParent = parentPathOf(item.path);
      const pastingIntoSameFolder = clipboard.share === currentShare && sourceParent === currentPath;
      let newName = item.name;
      if (clipboard.mode === "copy" && pastingIntoSameFolder) {
        newName = `Copy_of_${item.name}`;
      }

      const endpoint = clipboard.mode === "cut" ? "/api/files/move" : "/api/files/copy";
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            share: clipboard.share,
            src_path: item.path,
            is_dir: item.is_dir,
            dest_path: currentPath,
            new_name: newName
          })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || `${clipboard.mode === "cut" ? "Move" : "Copy"} failed for ${item.name}`);
        }
      } catch (err) {
        showStatus(err.message, true);
      }
    }

    if (clipboard.mode === "cut") {
      clipboard = null;
      updateClipboardBar();
    }
    selectedPaths.clear();
    updateSelectionToolbar();
    loadDirectory(currentShare, currentPath);
  });

  function updateClipboardBar() {
    if (!clipboard || !clipboard.items.length) {
      clipboardBar.style.display = "none";
      return;
    }
    clipboardBar.style.display = "flex";
    const verb = clipboard.mode === "cut" ? "Cut" : "Copied";
    clipboardInfo.innerText = `${verb} ${clipboard.items.length} item(s) — open the destination folder and click "Paste Here"`;
  }

  // ===================== Modal Closers =====================
  previewClose.addEventListener("click", () => previewModal.style.display = "none");
  deleteClose.addEventListener("click", closeDeleteModal);
  btnCancelDelete1.addEventListener("click", closeDeleteModal);
  btnCancelDelete2.addEventListener("click", closeDeleteModal);

  // ===================== Delete Confirmation Flow (single or multi) =====================
  function openDeleteModal(items) {
    pendingDeleteItems = items;
    deleteItemName.innerHTML = items
      .map(it => `${it.is_dir ? "📁 Folder: " : "📄 File: "} ${escapeHtml(it.name)}`)
      .join("<br>");
    deleteStep1.style.display = "block";
    deleteStep2.style.display = "none";
    deleteModal.style.display = "flex";
  }

  btnProceedDelete2.addEventListener("click", () => {
    deleteStep1.style.display = "none";
    deleteStep2.style.display = "block";
    deleteConfirmInput.value = "";
    btnFinalDelete.disabled = true;
    deleteConfirmInput.focus();
  });

  deleteConfirmInput.addEventListener("input", (e) => {
    btnFinalDelete.disabled = e.target.value.trim() !== "DELETE";
  });

  btnFinalDelete.addEventListener("click", async () => {
    if (!pendingDeleteItems.length) return;
    const items = pendingDeleteItems;
    closeDeleteModal();
    showStatus(`Deleting ${items.length} item(s)...`);

    for (const item of items) {
      try {
        const res = await fetch("/api/files/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ share: currentShare, path: item.path, is_dir: item.is_dir })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || `Delete failed for ${item.name}`);
        }
        selectedPaths.delete(item.path);
      } catch (err) {
        showStatus(err.message, true);
      }
    }
    updateSelectionToolbar();
    loadDirectory(currentShare, currentPath);
  });

  function closeDeleteModal() {
    deleteModal.style.display = "none";
    pendingDeleteItems = [];
  }

  // ===================== Session / Shares =====================
  async function checkSession() {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        showPortal(data.username);
        loadShares();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  async function loadShares() {
    sharesLoading.style.display = "block";
    sharesContainer.style.display = "none";
    sharesContainer.innerHTML = "";

    try {
      const res = await fetch("/api/shares/");
      if (!res.ok) throw new Error("Failed to load shares");

      const data = await res.json();
      sharesLoading.style.display = "none";
      if (!data.shares || data.shares.length === 0) return;

      sharesContainer.style.display = "grid";
      data.shares.forEach(share => {
        const card = document.createElement("div");
        card.className = "share-card";
        card.innerHTML = `
          <div>
            <div class="share-icon">📁</div>
            <div class="share-name">${escapeHtml(share.label)}</div>
            <div class="share-desc">${escapeHtml(share.description)}</div>
          </div>
          <div class="share-btn">Open Share &rarr;</div>
        `;
        card.addEventListener("click", () => openShare(share.name));
        sharesContainer.appendChild(card);
      });
    } catch (err) {
      sharesLoading.innerText = "Error loading shares.";
    }
  }

  function openShare(shareName) {
    currentShare = shareName;
    currentPath = "";
    clipboard = null;
    updateClipboardBar();
    selectedPaths.clear();
    showExplorerView();
    loadDirectory(shareName, "");
  }

  async function loadDirectory(shareName, subpath) {
    hideStatus();
    selectedPaths.clear();
    updateSelectionToolbar();
    renderBreadcrumbs(shareName, subpath);
    fileListBody.innerHTML = "<tr><td colspan='5' style='color:#64748b;'>Loading directory...</td></tr>";

    try {
      const res = await fetch(`/api/files/browse?share=${encodeURIComponent(shareName)}&path=${encodeURIComponent(subpath)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Unable to read directory");
      }
      const data = await res.json();
      currentItems = data.items;
      updateStorageWidget(data.storage, shareName);
      renderFileList(data.items);
    } catch (err) {
      fileListBody.innerHTML = `<tr><td colspan='5' style='color:#ef4444;'>${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function updateStorageWidget(storage, shareName) {
    if (!storage || storage.total === 0) {
      storageCard.style.display = "none";
      return;
    }
    storageCard.style.display = "flex";
    storageShareLabel.innerText = `Storage: ${shareName.toUpperCase()}`;
    storageDetails.innerText = `Used: ${formatBytes(storage.used)} / Total: ${formatBytes(storage.total)} (Free: ${formatBytes(storage.free)})`;
    storageBarFill.style.width = `${storage.percent_used}%`;
    storagePercent.innerText = `${storage.percent_used}%`;
  }

  function renderBreadcrumbs(shareName, subpath) {
    breadcrumbsContainer.innerHTML = "";
    const homeCrumb = document.createElement("span");
    homeCrumb.className = "crumb";
    homeCrumb.innerText = "Shares";
    homeCrumb.addEventListener("click", () => {
      showSharesView();
      loadShares();
    });
    breadcrumbsContainer.appendChild(homeCrumb);

    const sep = document.createElement("span");
    sep.innerText = " / ";
    breadcrumbsContainer.appendChild(sep);

    const shareCrumb = document.createElement("span");
    shareCrumb.className = "crumb";
    shareCrumb.innerText = shareName;
    shareCrumb.addEventListener("click", () => openShare(shareName));
    breadcrumbsContainer.appendChild(shareCrumb);

    if (subpath) {
      const parts = subpath.split("/").filter(Boolean);
      let accumulated = "";
      parts.forEach((part) => {
        accumulated += (accumulated ? "/" : "") + part;
        const currentAccumulated = accumulated;
        const subSep = document.createElement("span");
        subSep.innerText = " / ";
        breadcrumbsContainer.appendChild(subSep);

        const partCrumb = document.createElement("span");
        partCrumb.className = "crumb";
        partCrumb.innerText = part;
        partCrumb.addEventListener("click", () => {
          currentPath = currentAccumulated;
          loadDirectory(currentShare, currentAccumulated);
        });
        breadcrumbsContainer.appendChild(partCrumb);
      });
    }
  }

  function itemSubpathOf(item) {
    return currentPath ? `${currentPath}/${item.name}` : item.name;
  }

  function parentPathOf(subpath) {
    const clean = subpath.replace(/\\/g, "/").replace(/\/+$/, "");
    const parts = clean.split("/");
    parts.pop();
    return parts.join("/");
  }

  function renderFileList(items) {
    fileListBody.innerHTML = "";
    if (items.length === 0) {
      fileListBody.innerHTML = "<tr><td colspan='5' style='color:#64748b;'>Folder is empty — drag files here or click Upload</td></tr>";
      return;
    }

    items.forEach(item => {
      const tr = document.createElement("tr");
      const icon = item.is_dir ? "📁" : (item.preview_type ? "🖼️" : "📄");
      const itemSubpath = itemSubpathOf(item);
      const isSelected = selectedPaths.has(itemSubpath);
      if (isSelected) tr.classList.add("row-selected");

      const sizeCellHtml = item.is_dir
        ? `<span class="size-pending" data-role="size-cell">Calculating…</span>`
        : formatBytes(item.size);

      tr.innerHTML = `
        <td><input type="checkbox" class="row-select" ${isSelected ? "checked" : ""}></td>
        <td>
          <span class="item-link" data-name="${escapeHtml(item.name)}" data-isdir="${item.is_dir}">
            ${icon} ${escapeHtml(item.name)}
          </span>
        </td>
        <td>${sizeCellHtml}</td>
        <td>${escapeHtml(item.modified)}</td>
        <td style="text-align: right;">
          <div class="row-actions">
            ${item.preview_type ? `<button class="btn-icon btn-view" title="Preview">👁️</button>` : ""}
            ${!item.is_dir ? `<button class="btn-icon btn-dl" title="Download">⬇</button>` : ""}
            <button class="btn-icon btn-ren" title="Rename">✏</button>
            <button class="btn-icon btn-del" title="Delete" style="color:#ef4444;">🗑</button>
          </div>
        </td>
      `;

      // Row checkbox
      const rowCheckbox = tr.querySelector(".row-select");
      rowCheckbox.addEventListener("change", (e) => {
        toggleSelect(item, e.target.checked);
        tr.classList.toggle("row-selected", e.target.checked);
      });

      // Directory click / file preview click
      const itemLink = tr.querySelector(".item-link");
      if (item.is_dir) {
        itemLink.addEventListener("click", () => {
          currentPath = itemSubpath;
          loadDirectory(currentShare, currentPath);
        });
      } else if (item.preview_type) {
        itemLink.addEventListener("click", () => triggerPreview(itemSubpath, item.preview_type));
      }

      // Preview Button
      const viewBtn = tr.querySelector(".btn-view");
      if (viewBtn) viewBtn.addEventListener("click", () => triggerPreview(itemSubpath, item.preview_type));

      // Download Button
      const dlBtn = tr.querySelector(".btn-dl");
      if (dlBtn) {
        dlBtn.addEventListener("click", () => {
          window.location.href = `/api/files/download?share=${encodeURIComponent(currentShare)}&path=${encodeURIComponent(itemSubpath)}`;
        });
      }

      // Rename Button
      tr.querySelector(".btn-ren").addEventListener("click", async () => {
        const newName = prompt("Enter new name:", item.name);
        if (!newName || newName === item.name) return;
        try {
          const res = await fetch("/api/files/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ share: currentShare, old_path: itemSubpath, new_name: newName })
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || "Rename failed");
          }
          loadDirectory(currentShare, currentPath);
        } catch (err) {
          showStatus(err.message, true);
        }
      });

      // Delete Button (single item -> reuses the multi-item modal with 1 item)
      tr.querySelector(".btn-del").addEventListener("click", () => {
        openDeleteModal([{ path: itemSubpath, is_dir: item.is_dir, name: item.name }]);
      });

      // ---- Drag & drop: pick a row up ----
      itemLink.setAttribute("draggable", "true");
      itemLink.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-portal-item", JSON.stringify({
          path: itemSubpath, is_dir: item.is_dir, name: item.name, share: currentShare
        }));
      });

      // ---- Drag & drop: drop an item onto a folder row to move it in ----
      if (item.is_dir) {
        tr.addEventListener("dragover", (e) => {
          if (Array.from(e.dataTransfer.types || []).includes("application/x-portal-item")) {
            e.preventDefault();
            tr.classList.add("row-dragover");
          }
        });
        tr.addEventListener("dragleave", () => tr.classList.remove("row-dragover"));
        tr.addEventListener("drop", async (e) => {
          tr.classList.remove("row-dragover");
          const raw = e.dataTransfer.getData("application/x-portal-item");
          if (!raw) return;
          e.preventDefault();
          e.stopPropagation();
          const dragged = JSON.parse(raw);
          if (dragged.path === itemSubpath) return; // dropped on itself
          try {
            const res = await fetch("/api/files/move", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                share: dragged.share,
                src_path: dragged.path,
                is_dir: dragged.is_dir,
                dest_path: itemSubpath
              })
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.detail || `Move failed for ${dragged.name}`);
            }
            showStatus(`Moved "${dragged.name}" into "${item.name}"`);
            loadDirectory(currentShare, currentPath);
          } catch (err) {
            showStatus(err.message, true);
          }
        });
      }

      fileListBody.appendChild(tr);
    });

    // Lazily fetch folder sizes so opening a big folder stays fast
    items.forEach(item => {
      if (!item.is_dir) return;
      const itemSubpath = itemSubpathOf(item);
      fetch(`/api/files/folder-size?share=${encodeURIComponent(currentShare)}&path=${encodeURIComponent(itemSubpath)}`)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          const rows = fileListBody.querySelectorAll("tr");
          rows.forEach(row => {
            const link = row.querySelector(".item-link");
            if (link && link.dataset.name === item.name && link.dataset.isdir === "true") {
              const cell = row.querySelector('[data-role="size-cell"]');
              if (cell) {
                cell.classList.remove("size-pending");
                cell.innerText = formatBytes(data.size);
                cell.removeAttribute("data-role");
              }
            }
          });
        })
        .catch(() => {});
    });
  }

  function triggerPreview(itemSubpath, type) {
    const url = `/api/files/preview?share=${encodeURIComponent(currentShare)}&path=${encodeURIComponent(itemSubpath)}`;
    previewTitle.innerText = `Preview: ${itemSubpath.split("/").pop()}`;
    previewBody.innerHTML = "";

    if (type === "image") {
      const img = document.createElement("img");
      img.src = url;
      previewBody.appendChild(img);
    } else if (type === "pdf") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      previewBody.appendChild(iframe);
    }
    previewModal.style.display = "flex";
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function showStatus(msg, isError = false) {
    opStatus.innerText = msg;
    opStatus.style.display = "block";
    opStatus.style.backgroundColor = isError ? "#fee2e2" : "#dcfce7";
    opStatus.style.color = isError ? "#ef4444" : "#15803d";
  }

  function hideStatus() {
    opStatus.style.display = "none";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.innerText = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function showPortal(username) {
    loginSection.style.display = "none";
    portalSection.style.display = "flex";
    displayUser.innerText = `👤 ${username}`;
    showSharesView();
  }

  function showLogin() {
    portalSection.style.display = "none";
    loginSection.style.display = "flex";
  }

  function showSharesView() {
    sharesView.style.display = "block";
    explorerView.style.display = "none";
    storageCard.style.display = "none";
  }

  function showExplorerView() {
    sharesView.style.display = "none";
    explorerView.style.display = "block";
  }

  // Keyboard shortcut: Delete key removes current selection (with the same double-confirm modal)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Delete" && selectedPaths.size > 0 && explorerView.style.display !== "none") {
      openDeleteModal(Array.from(selectedPaths.values()));
    }
  });
});
