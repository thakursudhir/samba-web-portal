document.addEventListener("DOMContentLoaded", () => {
  let currentShare = null;
  let currentPath = "";
  let pendingDeleteItem = null;

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

  btnUploadModal.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    for (const file of files) {
      const formData = new FormData();
      formData.append("share", currentShare);
      formData.append("path", currentPath);
      formData.append("file", file);

      try {
        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData
        });
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
    loadDirectory(currentShare, currentPath);
  });

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

  // Modal Closers
  previewClose.addEventListener("click", () => previewModal.style.display = "none");
  deleteClose.addEventListener("click", closeDeleteModal);
  btnCancelDelete1.addEventListener("click", closeDeleteModal);
  btnCancelDelete2.addEventListener("click", closeDeleteModal);

  // Delete Confirmation Flow
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
    if (!pendingDeleteItem) return;
    try {
      const res = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          share: currentShare,
          path: pendingDeleteItem.path,
          is_dir: pendingDeleteItem.is_dir
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Delete failed");
      }
      closeDeleteModal();
      loadDirectory(currentShare, currentPath);
    } catch (err) {
      closeDeleteModal();
      showStatus(err.message, true);
    }
  });

  function closeDeleteModal() {
    deleteModal.style.display = "none";
    pendingDeleteItem = null;
  }

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
            <div class="share-name">${share.label}</div>
            <div class="share-desc">${share.description}</div>
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
    showExplorerView();
    loadDirectory(shareName, "");
  }

  async function loadDirectory(shareName, subpath) {
    hideStatus();
    renderBreadcrumbs(shareName, subpath);
    fileListBody.innerHTML = "<tr><td colspan='4' style='color:#64748b;'>Loading directory...</td></tr>";

    try {
      const res = await fetch(`/api/files/browse?share=${encodeURIComponent(shareName)}&path=${encodeURIComponent(subpath)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Unable to read directory");
      }
      const data = await res.json();
      updateStorageWidget(data.storage, shareName);
      renderFileList(data.items);
    } catch (err) {
      fileListBody.innerHTML = `<tr><td colspan='4' style='color:#ef4444;'>${err.message}</td></tr>`;
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

  function renderFileList(items) {
    fileListBody.innerHTML = "";
    if (items.length === 0) {
      fileListBody.innerHTML = "<tr><td colspan='4' style='color:#64748b;'>Folder is empty</td></tr>";
      return;
    }

    items.forEach(item => {
      const tr = document.createElement("tr");
      const icon = item.is_dir ? "📁" : (item.preview_type ? "👁️" : "📄");
      const itemSubpath = currentPath ? `${currentPath}/${item.name}` : item.name;

      tr.innerHTML = `
        <td>
          <span class="item-link" data-name="${item.name}" data-isdir="${item.is_dir}">
            ${icon} ${item.name}
          </span>
        </td>
        <td>${item.is_dir ? "-" : formatBytes(item.size)}</td>
        <td>${item.modified}</td>
        <td style="text-align: right;">
          <div class="row-actions">
            ${item.preview_type ? `<button class="btn-icon btn-view" title="Preview">👁️</button>` : ""}
            ${!item.is_dir ? `<button class="btn-icon btn-dl" title="Download">⬇</button>` : ""}
            ${!item.is_dir ? `<button class="btn-icon btn-copy" title="Copy">📋</button>` : ""}
            <button class="btn-icon btn-ren" title="Rename">✏</button>
            <button class="btn-icon btn-del" title="Delete" style="color:#ef4444;">🗑</button>
          </div>
        </td>
      `;

      // Directory click
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
      if (viewBtn) {
        viewBtn.addEventListener("click", () => triggerPreview(itemSubpath, item.preview_type));
      }

      // Download Button
      const dlBtn = tr.querySelector(".btn-dl");
      if (dlBtn) {
        dlBtn.addEventListener("click", () => {
          window.location.href = `/api/files/download?share=${encodeURIComponent(currentShare)}&path=${encodeURIComponent(itemSubpath)}`;
        });
      }

      // Copy Button
      const copyBtn = tr.querySelector(".btn-copy");
      if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
          const defaultCopyName = "Copy_of_" + item.name;
          const newName = prompt("Enter name for the copy:", defaultCopyName);
          if (!newName) return;
          try {
            const res = await fetch("/api/files/copy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ share: currentShare, src_path: itemSubpath, new_name: newName })
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.detail || "Copy failed");
            }
            loadDirectory(currentShare, currentPath);
          } catch (err) {
            showStatus(err.message, true);
          }
        });
      }

      // Rename Button
      const renBtn = tr.querySelector(".btn-ren");
      renBtn.addEventListener("click", async () => {
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

      // Double-Confirmation Delete Button
      const delBtn = tr.querySelector(".btn-del");
      delBtn.addEventListener("click", () => {
        pendingDeleteItem = { path: itemSubpath, is_dir: item.is_dir, name: item.name };
        deleteItemName.innerText = `${item.is_dir ? "Folder: " : "File: "} ${item.name}`;
        deleteStep1.style.display = "block";
        deleteStep2.style.display = "none";
        deleteModal.style.display = "flex";
      });

      fileListBody.appendChild(tr);
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
    if (bytes === 0) return "0 B";
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
});