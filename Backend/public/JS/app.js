/*
  SEAON ERP FRONTEND CONTROLLER

  This is intentionally one readable file.
  Each section is a small screen:
    dashboard -> inventory -> orders -> production -> BOM -> warehouse
    -> returns -> FIFO -> reports -> alerts.

  It uses the API functions in api.js and never talks to SQLite directly.
*/
document.addEventListener("DOMContentLoaded", async()=>{
  document.addEventListener("input", event => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || el.type !== "number") return;
    if (el.value !== "" && Number(el.value) < 0) {
      el.value = "0";
      toast("Negative values are not allowed.", "warning");
    }
  });

  if(!Auth.isAuthenticated()){location.replace("/app/login.html");return;}

  // Never rely only on stale localStorage role data. The database is the
  // source of truth for the signed-in user's role and permissions.
  try {
    const currentUser = await API.auth.me();
    localStorage.setItem("seaon_user", JSON.stringify(currentUser));
  } catch (error) {
    Auth.clearSession();
    location.replace("/app/login.html");
    return;
  }

  const state={page:"dashboard",products:[],orders:[],inventory:[],production:[],bom:[],returns:[],batches:[],warehouse:[]};
  const role=Auth.user()?.role||"viewer";
  const $=s=>document.querySelector(s);
  const pageEl=$("#page");

  const pageInfo={
    dashboard:["Dashboard","A simple view of today's operations."],
    inventory:["Inventory","Current stock, minimum levels and stock movements."],
    orders:["Orders","Create and track manufactured and readymade orders."],
    production:["Production","Production queue, output and completion."],
    bom:["BOM / Materials","Map raw and semi-finished materials to products."],
    warehouse:["Warehouse","Inward, putaway, pick, pack and dispatch movements."],
    returns:["Returns","Track returned products from request to redelivery."],
    fifo:["FIFO Batches","Use the oldest stock batch first."],
    reports:["Reports","Simple management, stock and workflow summaries."],
    notifications:["Alerts","Low stock, dead stock and near-expiry alerts."]
  };

  const currentUser = Auth.user() || {};
  const displayName = currentUser.full_name || currentUser.email || "User";
  const displayRole = (currentUser.role || "user").replaceAll("-"," ").replace(/\b\w/g,c=>c.toUpperCase());
  const profileInitials = $("#profileInitials");
  if (profileInitials) profileInitials.textContent = displayName.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();

  // Profile popover markup may be absent on older/cached pages. Never let
  // optional profile UI stop the dashboard and navigation from initializing.
  const profileNameEl = $("#profileName");
  const profileRoleEl = $("#profileRole");
  const profileLastLoginEl = $("#profileLastLogin");
  if (profileNameEl) profileNameEl.textContent = displayName;
  if (profileRoleEl) profileRoleEl.textContent = displayRole;
  const lastLogin = currentUser.last_login || currentUser.last_login_at || currentUser.lastLogin;
  if (profileLastLoginEl) profileLastLoginEl.textContent = lastLogin ? new Date(lastLogin).toLocaleString("en-IN") : "N/A";
  API.branding.get().then(applyBranding).catch(()=>{});
  API.notifications.list().then(rows=>{const btn=document.querySelector('[data-page="notifications"]');if(!btn)return;const count=rows.filter(n=>!n.is_read).length;let badge=btn.querySelector(".notification-count");if(!badge){badge=document.createElement("span");badge.className="notification-count";btn.appendChild(badge)}badge.textContent=count?String(count):"";badge.style.display=count?"inline-flex":"none";}).catch(()=>{});
  function applyBranding(b){
    document.querySelectorAll(".brand-mark").forEach(mark=>{mark.textContent=b.logo_text||"S";mark.style.background=b.logo_color||"#2563eb";mark.style.borderRadius=b.logo_style==="circle"?"50%":b.logo_style==="square"?"4px":"12px";});
    document.querySelectorAll(".brand strong, .topbar-brand strong").forEach(title=>title.textContent=b.company_name||"SEAON ERP");
    document.querySelectorAll(".brand small, .topbar-brand small").forEach(tagline=>tagline.textContent=b.tagline||"Manufacturing & Stock");
  }
  const roleBadge = $("#roleBadge");
  if (roleBadge) roleBadge.textContent = role.replaceAll("-"," ").replace(/\b\w/g,c=>c.toUpperCase());
  const adminLink = $("#adminLink");
  if(adminLink && !["super-admin","admin"].includes(role)) adminLink.classList.add("hidden");
  const perms=Auth.user()?.permissions||[];
  const can=(code)=>perms.includes("*")||perms.includes(code);
  const menuPermission={
    inventory:"inventory.view",orders:"orders.view",production:"production.view",
    bom:"bom.read",warehouse:"warehouse.receive",returns:"returns.view",fifo:"inventory.fifo",reports:"reports.view"
  };
  document.querySelectorAll(".nav-item[data-page]").forEach(btn=>{
    const need=menuPermission[btn.dataset.page];
    if(need && !can(need)) btn.classList.add("hidden");
  });

  const sidebar = $("#sidebar");
  const sidebarOverlay = $("#sidebarOverlay");
  function closeSidebar(){ sidebar.classList.remove("open"); sidebarOverlay?.classList.remove("show"); }
  function toggleSidebar(){ const open=!sidebar.classList.contains("open"); sidebar.classList.toggle("open",open); sidebarOverlay?.classList.toggle("show",open); }
  $("#mobileMenu").onclick=toggleSidebar;
  sidebarOverlay?.addEventListener("click",closeSidebar);
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeSidebar()});
  $("#logoutBtn").onclick=()=>Auth.logout();
  $("#refreshBtn").onclick=()=>loadPage(state.page);
  const profileToggle = $("#profileToggle");
  const profilePopover = $("#profilePopover");
  function closeProfile() {
    profilePopover?.classList.add("hidden");
    profileToggle?.setAttribute("aria-expanded", "false");
  }
  profileToggle?.addEventListener("click", event => {
    event.stopPropagation();
    const willOpen = profilePopover.classList.contains("hidden");
    profilePopover.classList.toggle("hidden", !willOpen);
    profileToggle.setAttribute("aria-expanded", String(willOpen));
  });
  profilePopover?.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", closeProfile);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeProfile(); });
  $("#profileChangePassword")?.addEventListener("click", () => {
    closeProfile();
    openChangePassword();
  });

  document.querySelectorAll(".nav-item[data-page]").forEach(btn=>{
    btn.onclick=()=>{state.page=btn.dataset.page; document.querySelectorAll(".nav-item[data-page]").forEach(x=>x.classList.remove("active"));btn.classList.add("active");closeSidebar();loadPage(state.page);}
  });

  function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
  function num(v,maxFractionDigits=2){return Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:maxFractionDigits});}
  function date(v){return v?new Date(v).toLocaleDateString("en-IN"):"-";}
  function money(v){return `₹${num(v)}`;}
  function badge(status){
    const s=String(status||"").toLowerCase();
    const type=["completed","closed","delivered"].includes(s)?"success":["cancelled","dead"].includes(s)?"danger":["pending","requested","inspection","in-progress","repair","replacement"].includes(s)?"warning":"neutral";
    return `<span class="badge ${type}">${esc(String(status||"").replaceAll("-"," "))}</span>`;
  }
  function empty(message="No records found."){return `<div class="empty">${esc(message)}</div>`;}
  function toast(message,type="success"){const x=document.createElement("div");x.className=`toast ${type}`;x.textContent=message;$("#toastArea").appendChild(x);setTimeout(()=>x.remove(),3500);}
  function setHead(page){$("#pageTitle").textContent=pageInfo[page][0];$("#pageSubtitle").textContent=pageInfo[page][1];}
  function modal(title,body){
    document.querySelector(".modal-backdrop")?.remove();
    const wrap=document.createElement("div");wrap.className="modal-backdrop show";wrap.innerHTML=`<div class="modal"><div class="modal-head"><h2>${title}</h2><button class="close" data-close>×</button></div>${body}</div>`;
    document.body.appendChild(wrap);wrap.onclick=e=>{if(e.target===wrap||e.target.closest("[data-close]"))wrap.remove()};return wrap;
  }
  // Numeric business inputs are non-negative. Stock adjustment is the one
  // intentional exception because a negative delta means stock reduction.
  document.addEventListener("focusin",event=>{
    const input=event.target;
    if(input instanceof HTMLInputElement && input.type==="number" && input.id!=="stockAdjustmentAmount"){
      input.min="0";
      if(!input.hasAttribute("step")) input.step="any";
    }
  });
  document.addEventListener("beforeinput",event=>{
    const input=event.target;
    if(input instanceof HTMLInputElement && input.type==="number" && input.id!=="stockAdjustmentAmount" && event.data==="-") event.preventDefault();
  });
  document.addEventListener("keydown",event=>{
    const input=event.target;
    if(input instanceof HTMLInputElement && input.type==="number" && input.id!=="stockAdjustmentAmount" && (event.key==="-" || event.code==="NumpadSubtract")) event.preventDefault();
  });
  document.addEventListener("input",event=>{
    const input=event.target;
    if(input instanceof HTMLInputElement && input.type==="number" && input.id!=="stockAdjustmentAmount"){
      input.min="0";
      if(input.value!=="" && Number(input.value)<0){input.value="";input.setCustomValidity("Please enter a positive value or zero.");}
      else input.setCustomValidity("");
    }
  });
  function bindTableSearch(inputId, bodyId){
    const input=document.getElementById(inputId), body=document.querySelector(bodyId.includes(" ")?bodyId:`#${bodyId}`);
    if(!input||!body)return;
    input.addEventListener("input",()=>{
      const query=input.value.trim().toLowerCase();
      body.querySelectorAll("tr").forEach(row=>{row.style.display=row.textContent.toLowerCase().includes(query)?"":"none";});
    });
  }
  function openChangePassword(){
    const m=modal("Change Password",`<form id="changePasswordForm" class="form-grid">
      ${field("Current password","current_password","password","Enter current password",true)}
      ${field("New password","new_password","password","At least 8 characters",true)}
      ${field("Confirm new password","confirm_password","password","Re-enter new password",true)}
      <div class="field full"><button class="btn primary" type="submit">Update Password</button></div>
    </form>`);
    const form=m.querySelector("#changePasswordForm");
    form.onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));
      if(data.new_password.length<8){toast("New password must contain at least 8 characters.","error");return;}
      if(data.new_password!==data.confirm_password){toast("New passwords do not match.","error");return;}
      try{await API.auth.changePassword(data.current_password,data.new_password);Auth.clearSession();location.replace("/app/login.html");}
      catch(error){toast(error.message,"error");}
    };
  }

  // Fetch the server-owned data needed by a screen, then render that screen.
  // Keeping reads here prevents stale cross-screen state after mutations.
  async function loadPage(page){
    setHead(page);
    pageEl.innerHTML=`<div class="card"><div class="empty">Loading ${esc(pageInfo[page][0])}...</div></div>`;
    try{
      if(page==="dashboard")return renderDashboard(await API.dashboard());
      if(page==="inventory"){state.inventory=await API.inventory.list();state.products=await API.products.list();return renderInventory();}
      if(page==="orders"){state.orders=await API.orders.list();state.products=await API.products.list();return renderOrders();}
      if(page==="production"){state.production=await API.production.list();state.products=await API.products.list();return renderProduction();}
      if(page==="bom"){state.bom=await API.bom.list();state.products=await API.products.list();return renderBOM();}
      if(page==="warehouse"){state.warehouse=await API.warehouse.list();state.products=await API.products.list();return renderWarehouse();}
      if(page==="returns"){state.returns=await API.returns.list();state.orders=await API.orders.list();return renderReturns();}
      if(page==="fifo"){state.batches=await API.inventory.batches();state.products=await API.products.list();return renderFIFO();}
      if(page==="reports")return renderReports(await API.reports());
      if(page==="notifications")return renderNotifications();
    }catch(e){pageEl.innerHTML=`<div class="card"><div class="error-box">${esc(e.message)}</div></div>`;toast(e.message,"error");}
  }

  function renderDashboard(d){
    pageEl.innerHTML=`
      <div class="grid grid-4">
        ${kpi("Orders",d.orders_total,"Total orders")}
        ${kpi("Pending",d.orders_pending,"Need attention","warning")}
        ${kpi("Production",d.production_active,"Active jobs")}
        ${kpi("Low Stock",d.low_stock,"Items at/below minimum",d.low_stock?"danger":"success")}
      </div>
      <div class="grid grid-3" style="margin-top:16px">
        ${kpi("Inventory Items",d.inventory_items,"Tracked products")}
        ${kpi("Returns",d.returns_open,"Open return cases")}
        ${kpi("FIFO Batches",d.fifo_batches,"Batches with stock")}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="section-head"><h2>Recent Orders</h2><button class="btn small" data-go="orders">Open Orders</button></div>${orderTable(d.recent_orders||[])}</div>
        <div class="card"><div class="section-head"><h2>Stock Health</h2><button class="btn small" data-go="inventory">Open Inventory</button></div>
          <div class="chart-bars">
            ${bar("Low stock",d.stock_health?.low_stock||0,Math.max(1,d.inventory_items))}
            ${bar("Dead stock",d.stock_health?.dead_stock||0,Math.max(1,d.inventory_items))}
            ${bar("Near expiry",d.stock_health?.near_expiry||0,Math.max(1,d.fifo_batches))}
          </div>
        </div>
      </div>`;
    pageEl.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>{state.page=x.dataset.go;document.querySelector(`[data-page="${state.page}"]`).click()});
  }
  function kpi(label,value,hint,type="neutral"){return `<div class="kpi"><div class="label">${label}</div><strong class="${type==="danger"?"danger-text":""}">${num(value)}</strong><div class="hint">${hint}</div></div>`}
  function bar(label,value,max){const pct=Math.min(100,Math.round((Number(value)/max)*100));return `<div class="bar-row"><span>${label}</span><div class="bar"><span style="width:${pct}%"></span></div><strong>${num(value)}</strong></div>`}

  function renderInventory(){
  pageEl.innerHTML = `
  <div class="inventory-page">

    <!-- Heading -->
    <div class="inventory-title">
      <h2>Inventory Management</h2>
      <p class="muted">
        Create, edit, receive, adjust and remove products while keeping live stock connected to orders.
      </p>
    </div>

    <!-- Summary Cards -->
    <div class="inventory-summary-cards">

      <div class="inventory-summary-card">
        <div>
          <span class="summary-label">Total Items</span>
          <strong id="totalInventoryItems">0</strong>
        </div>
        <div class="summary-icon orange">◇</div>
      </div>

      <div class="inventory-summary-card">
        <div>
          <span class="summary-label">Low Stock Alerts</span>
          <strong id="lowStockItems">0</strong>
        </div>
        <div class="summary-icon red">!</div>
      </div>

      <div class="inventory-summary-card">
        <div>
          <span class="summary-label">Stock Status OK</span>
          <strong id="healthyStockItems">0</strong>
        </div>
        <div class="summary-icon green">✓</div>
      </div>

    </div>

    <!-- Filters and Actions -->
    <div class="inventory-toolbar">

      <div class="inventory-filters">
        <input
          id="invSearch"
          type="text"
          placeholder="Search item, SKU or location"
        >

        <select id="invFilter">
          <option value="">All stock</option>
          <option value="low">Low stock</option>
        </select>
      </div>

      <div class="inventory-actions">
        <button class="btn primary" data-action="add-product">
          + Add Product
        </button>

        <button class="btn" data-action="receive">
          Receive Stock
        </button>
      </div>

    </div>

    <!-- Inventory Table -->
    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Minimum</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="inventoryRows"></tbody>
        </table>
      </div>
    </div>

  </div>
`;
    const draw=()=>{
      const q=( $("#invSearch")?.value||"").toLowerCase(), low=$("#invFilter")?.value==="low";
      const rows=state.inventory.filter(i=>(!q||`${i.product_name} ${i.sku} ${i.location}`.toLowerCase().includes(q))&&(!low||Number(i.quantity)<=Number(i.minimum_stock)));
      $("#inventoryRows").innerHTML=rows.length?rows.map(i=>`<tr><td><strong>${esc(i.product_name)}</strong></td><td>${esc(i.sku)}</td><td>${num(i.quantity)}</td><td>${esc(i.unit)}</td><td>${num(i.minimum_stock)}</td><td>${esc(i.location)}</td><td>${badge(Number(i.quantity)<=Number(i.minimum_stock)?"Low Stock":"Healthy")}</td><td><div class="actions"><button class="btn small" data-adjust="${i.product}">Adjust</button><button class="btn small" data-edit-product="${i.product}">Edit</button><button class="btn small danger" data-delete-product="${i.product}">Delete</button></div></td></tr>`).join(""):`<tr><td colspan="8">${empty()}</td></tr>`;
      $("#inventoryRows").querySelectorAll("[data-adjust]").forEach(b=>b.onclick=()=>adjustStock(b.dataset.adjust));
      $("#inventoryRows").querySelectorAll("[data-edit-product]").forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct));
      $("#inventoryRows").querySelectorAll("[data-delete-product]").forEach(b=>b.onclick=()=>deleteProduct(b.dataset.deleteProduct));
    };
    $("#invSearch").oninput=draw;$("#invFilter").onchange=draw;draw();updateInventorySummary();
    pageEl.querySelector('[data-action="add-product"]').onclick=addProduct;
    pageEl.querySelector('[data-action="receive"]').onclick=receiveStock;
    updateInventorySummary()
  }

// Update Inventory Summary Cards
function updateInventorySummary() {
  const items = state.inventory || [];

  const totalItems = items.length;

  const lowStock = items.filter(item =>
    Number(item.quantity || 0) <=
    Number(item.minimum_stock || 0)
  ).length;

  const healthyStock = totalItems - lowStock;

  const totalEl = document.getElementById("totalInventoryItems");
  const lowEl = document.getElementById("lowStockItems");
  const healthyEl = document.getElementById("healthyStockItems");

  if (totalEl) totalEl.textContent = totalItems;
  if (lowEl) lowEl.textContent = lowStock;
  if (healthyEl) healthyEl.textContent = healthyStock;
}

  async function deleteProduct(id) {
    const product = state.products.find(p => String(p.id) === String(id));
    if (!product) {
      toast("Product not found. Refresh inventory and try again.", "error");
      return;
    }
    const confirmed = window.confirm(
      `Delete "${product.name}" (${product.sku})? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await API.products.remove(id);
      toast("Product deleted successfully.");
      await loadPage("inventory");
    } catch (error) {
      toast(error.message || "Unable to delete product.", "error");
    }
  }

function productFormMarkup(product = {}) {
  return `
    <form id="productForm" class="form-grid product-modal-form">

      <div class="field">
        <label>Item Name</label>
        <input
          type="text"
          name="name"
          placeholder="Enter item name"
          value="${esc(product.name || "")}"
          required
        >
      </div>

      <div class="field">
        <label>SKU</label>
        <input
          type="text"
          name="sku"
          placeholder="Enter unique SKU"
          value="${esc(product.sku || "")}"
          required
        >
      </div>

      <div class="field">
        <label>Type</label>
        <select name="product_type" id="productType" required>
          <option value="">Select Type</option>
          <option value="raw-material">Raw Material</option>
          <option value="component">Semi Finished Product</option>
          <option value="finished">Finished Product</option>
        </select>
      </div>

      <div class="field">
        <label>Available Quantity</label>
        <input
          type="number"
          name="quantity"
          min="0"
          step="any"
          placeholder="Enter quantity"
          value="${product.quantity ?? 0}"
          required
        >
      </div>

      <div class="field">
        <label>Unit</label>
        <select name="unit" required>
          <option value="">Select unit</option>
          ${["pcs", "kg", "g", "m", "cm", "roll", "boxes"].map(unit => `
            <option value="${unit}"
              ${product.unit === unit ? "selected" : ""}>
              ${unit}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="field">
        <label>Minimum Stock</label>
        <input
          type="number"
          name="minimum_stock"
          min="0"
          step="any"
          placeholder="Enter minimum stock"
          value="${product.minimum_stock ?? 0}"
        >
      </div>

      <div class="field">
        <label>Location</label>
        <input
          type="text"
          name="location"
          placeholder="Enter location"
          value="${esc(product.location || "")}"
        >
      </div>

      <div id="rawMaterialFields"
           class="field full raw-material-fields"
           style="display:none">

        <div class="form-grid">
          <div class="field">
            <label>Thickness (mm)</label>
            <input
              type="number"
              name="thickness"
              min="0"
              step="any"
              placeholder="Enter thickness"
              value="${product.thickness ?? ""}"
            >
          </div>

          <div class="field">
            <label>Size</label>
            <input
              type="text"
              name="size"
              placeholder="Enter size"
              value="${esc(product.size || "")}"
            >
          </div>

          <div class="field">
            <label>Color</label>
            <input
              type="text"
              name="color"
              placeholder="Enter color"
              value="${esc(product.color || "")}"
            >
          </div>
        </div>
      </div>

      <div class="field full product-form-actions">
        <button type="button" class="btn" data-close>
          Cancel
        </button>

        <button type="submit" class="btn primary">
          ${product.id ? "Save Changes" : "Add Product"}
        </button>
      </div>

    </form>
  `;
}


// ADD PRODUCT
function addProduct() {
  const m = modal("Add Product", productFormMarkup());
  const form = m.querySelector("#productForm");

  const typeSelect = form.elements.product_type;
  const rawFields = form.querySelector("#rawMaterialFields");

  function updateRawFields() {
    rawFields.style.display =
      typeSelect.value === "raw-material" ? "block" : "none";
  }

  typeSelect.addEventListener("change", updateRawFields);

  form.onsubmit = async e => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form));

    data.quantity = Number(data.quantity || 0);
    data.minimum_stock = Number(data.minimum_stock || 0);

    data.thickness =
      data.product_type === "raw-material" && data.thickness !== ""
        ? Number(data.thickness)
        : null;

    if (data.product_type !== "raw-material") {
      data.size = "";
      data.color = "";
    }

    if (!data.product_type) {
      toast("Please select a product type.", "error");
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Saving...";

    try {
      await API.products.create(data);

      m.remove();
      toast("Product created successfully.");
      loadPage("inventory");

    } catch (error) {
      toast(error.message, "error");
      submit.disabled = false;
      submit.textContent = "Add Product";
    }
  };

  updateRawFields();
}


// EDIT PRODUCT
function editProduct(id) {
  const item = state.products.find(
    p => String(p.id) === String(id)
  );

  if (!item) {
    toast("Product not found.", "error");
    return;
  }

  const m = modal("Edit Product", productFormMarkup(item));
  const form = m.querySelector("#productForm");

  const typeSelect = form.elements.product_type;
  const rawFields = form.querySelector("#rawMaterialFields");

  // Populate existing product data.
  for (const key of [
    "name",
    "sku",
    "product_type",
    "unit",
    "quantity",
    "minimum_stock",
    "location",
    "thickness",
    "size",
    "color"
  ]) {
    if (form.elements[key]) {
      form.elements[key].value = item[key] ?? "";
    }
  }

  function updateRawFields() {
    rawFields.style.display =
      typeSelect.value === "raw-material" ? "block" : "none";
  }

  typeSelect.addEventListener("change", updateRawFields);

  form.onsubmit = async e => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form));

    data.quantity = Number(data.quantity || 0);
    data.minimum_stock = Number(data.minimum_stock || 0);

    data.thickness =
      data.product_type === "raw-material" && data.thickness !== ""
        ? Number(data.thickness)
        : null;

    if (data.product_type !== "raw-material") {
      data.size = "";
      data.color = "";
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Saving...";

    try {
      await API.products.update(id, data);

      m.remove();
      toast("Product updated successfully.");
      loadPage("inventory");

    } catch (error) {
      toast(error.message, "error");
      submit.disabled = false;
      submit.textContent = "Save Changes";
    }
  };

  updateRawFields();
}

  async function adjustStock(id) {
    const item = (state.inventory || []).find(
      row => String(row.product) === String(id)
    );

    if (!item) {
      toast("Inventory record not found. Refresh and try again.", "error");
      return;
    }

    document.getElementById("stockAdjustmentModal")?.remove();

    const current = Number(item.quantity || 0);
    const unit = item.unit || "";
    const overlay = document.createElement("div");
    overlay.id = "stockAdjustmentModal";
    overlay.className = "stock-adjustment-overlay";
    overlay.innerHTML = `
      <section class="stock-adjustment-modal" role="dialog" aria-modal="true">
        <header class="stock-adjustment-header">
          <div><h2>Adjust Stock</h2><p>Update the available inventory quantity.</p></div>
          <button type="button" class="stock-adjustment-close" aria-label="Close">&times;</button>
        </header>
        <div class="stock-adjustment-product">
          <span>Product</span>
          <strong>${esc(item.product_name || "Inventory item")}</strong>
          <small>SKU: ${esc(item.sku || "—")}</small>
          <small>Current Stock: <b>${num(current)} ${esc(unit)}</b></small>
        </div>
        <form id="stockAdjustmentForm">
          <label for="stockAdjustmentAmount">Stock Change</label>
          <input id="stockAdjustmentAmount" type="number" step="any" required placeholder="Example: 10 or -5">
          <small>Use a positive number to add stock or a negative number to remove stock.</small>
          <div class="stock-adjustment-preview">New Quantity <strong id="stockAdjustmentPreview">${num(current)} ${esc(unit)}</strong></div>
          <div id="stockAdjustmentError" class="stock-adjustment-error" hidden></div>
          <footer class="stock-adjustment-actions">
            <button type="button" class="btn" data-cancel>Cancel</button>
            <button type="submit" class="btn primary" disabled>Save Adjustment</button>
          </footer>
        </form>
      </section>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("#stockAdjustmentForm");
    const input = overlay.querySelector("#stockAdjustmentAmount");
    const preview = overlay.querySelector("#stockAdjustmentPreview");
    const error = overlay.querySelector("#stockAdjustmentError");
    const save = form.querySelector('[type="submit"]');

    const close = () => overlay.remove();
    overlay.querySelector(".stock-adjustment-close").onclick = close;
    overlay.querySelector("[data-cancel]").onclick = close;
    overlay.addEventListener("click", event => {
      if (event.target === overlay) close();
    });

    input.addEventListener("input", () => {
      const raw = input.value.trim();
      const amount = Number(raw);
      const next = current + amount;
      const valid = raw !== "" && Number.isFinite(amount) && amount !== 0 && next >= 0;
      preview.textContent = `${num(next)} ${unit}`;
      save.disabled = !valid;
      error.hidden = true;
    });

    form.onsubmit = async event => {
      event.preventDefault();
      const raw = input.value.trim();
      const amount = Number(raw);
      if (!raw || !Number.isFinite(amount) || amount === 0 || current + amount < 0) {
        error.textContent = "Enter a valid adjustment. Stock cannot become negative.";
        error.hidden = false;
        return;
      }
      save.disabled = true;
      save.textContent = "Saving...";
      try {
        await API.inventory.adjust(id, amount, "Manual adjustment");
        close();
        await loadPage("inventory");
        toast("Stock adjusted successfully.");
      } catch (err) {
        error.textContent = err.message || "Unable to adjust stock.";
        error.hidden = false;
        save.disabled = false;
        save.textContent = "Save Adjustment";
      }
    };
    input.focus();
  }


  function receiveStock(){
    const options=state.products.map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join("");
    const m=modal("Receive Stock",`<form id="receiveForm" class="form-grid"><div class="field full"><label>Product</label><select name="product">${options}</select></div>${field("Quantity","quantity","number","0",true)}${field("Vendor","vendor","text","Supplier name")}${field("Batch code","batch_code","text","Optional")}${field("Unit cost","unit_cost","number","0")}${field("Received date","received_date","date","")}${field("Expiry date","expiry_date","date","")}${field("Reference","reference","text","Purchase / GRN number")}<div class="field full"><button class="btn primary" type="submit">Receive Stock</button></div></form>`);
    m.querySelector("#receiveForm").onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.product=Number(data.product);data.quantity=Number(data.quantity);try{await API.inventory.receive(data);m.remove();toast("Stock received.");loadPage("inventory")}catch(ex){toast(ex.message,"error")}};
  }

  function renderOrders(){
    const statuses=[["","All Orders"],["new-order","New Order"],["in-production","In Production"],["packed","Packed"],["dispatched","Dispatched"],["delivered","Delivered"]];
    pageEl.innerHTML=`<section class="card order-create-section">
        <div class="section-head"><h2>Create Order</h2></div>
        <div id="orderFormHost"></div>
      </section>
      <section class="card order-list-section">
        <div class="section-head"><h2>Orders</h2></div>
        <div class="filters"><input id="orderSearch" placeholder="Search order, customer or product"><select id="orderStatus">${statuses.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join("")}</select></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Product</th><th>Qty</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody id="ordersRows"></tbody></table></div>
      </section>`;
    renderOrderForm();
    const draw=()=>{const q=$("#orderSearch").value.toLowerCase(),status=$("#orderStatus").value;const rows=state.orders.filter(o=>(!status||o.status===status)&&(!q||`${o.order_number} ${o.customer_name} ${o.product_name}`.toLowerCase().includes(q)));
      $("#ordersRows").innerHTML=rows.length?rows.map(o=>{const next=o.status==="new-order"?"packed":o.status==="packed"?"dispatched":o.status==="dispatched"?"delivered":"";return `<tr><td><strong>${esc(o.order_number)}</strong></td><td>${esc(o.customer_name)}</td><td>${esc(o.order_type||"manufactured")}</td><td>${esc(o.product_name)}</td><td>${num(o.quantity,4)} ${esc(o.unit||"")}</td><td>${badge(o.status)}</td><td>${date(o.created_at)}</td><td>${next?`<select class="form-control order-action-select" data-transition="${o.id}" aria-label="Order action"><option value="">Select action</option><option value="${next}">${next==="packed"?"Mark Packed":next==="dispatched"?"Dispatched":"Delivered"}</option></select>`:"—"}</td></tr>`}).join(""):`<tr><td colspan="8">${empty()}</td></tr>`;
      $("#ordersRows").querySelectorAll("select[data-transition]").forEach(sel=>sel.onchange=async()=>{const status=sel.value;if(!status)return;sel.disabled=true;try{await API.orders.transition(sel.dataset.transition,status);toast(`Order marked ${status.replaceAll("-"," ")}.`);loadPage("orders")}catch(e){toast(e.message,"error");sel.disabled=false;sel.value=""}});
    };
    $("#orderSearch").oninput=draw;$("#orderStatus").onchange=draw;draw();
  }

  function renderOrderForm() {
    const host = $("#orderFormHost");
    const formProducts = (state.products || []).filter(p => p.is_active !== false);

    host.innerHTML = `
      <form id="orderForm" class="form-grid">
        ${field("Customer", "customer_name", "text", "Customer name", true)}
        ${field("Customer email", "customer_email", "email", "")}
        <div class="field full">
          <label for="vendor_emails">CC emails <span class="muted">(optional, multiple allowed)</span></label>
          <textarea id="vendor_emails" name="vendor_emails" rows="3"
            placeholder="accounts@example.com, manager@example.com"></textarea>
          <small class="muted">Separate addresses with commas, semicolons or new lines.</small>
        </div>

        ${field("Vendor WhatsApp", "vendor_whatsapp", "tel", "+919876543210")}

        <div class="field">
          <label for="orderProductType">Product Type</label>
          <select id="orderProductType" name="product_category" required>
            <option value="finished">Finished</option>
            <option value="component">Semi-finished</option>
          </select>
        </div>

        <div class="field">
          <label for="orderProduct">Product</label>
          <select id="orderProduct" name="product" required>
            <option value="">Select product</option>
          </select>
        </div>

        ${field("Quantity", "quantity", "number", "1", true)}
        <div class="field full">
          <label for="orderNotes">Notes</label>
          <textarea id="orderNotes" name="notes"></textarea>
        </div>

        <div class="field full">
          <div id="availabilityPanel" class="alert warning">
            Select a product and quantity to check stock and BOM availability.
          </div>
        </div>

        <div class="field full">
          <button class="btn primary" id="createOrderButton" type="submit" disabled>Create Order</button>
        </div>
      </form>`;

    const form = host.querySelector("#orderForm");
    const category = form.elements.product_category;
    const product = form.elements.product;
    const quantity = form.elements.quantity;
    const fulfilment = { value: "manufactured" };
    const panel = host.querySelector("#availabilityPanel");
    const submit = host.querySelector("#createOrderButton");
    let timer = null;
    let requestSequence = 0;

    function refreshProducts() {
      const selectedCategory = category.value;
      const matching = formProducts.filter(p => {
        const type = String(p.product_type || "").toLowerCase();
        return selectedCategory === "finished"
          ? type === "finished"
          : ["component", "semi-finished", "semi_finished"].includes(type);
      });

      product.innerHTML = matching.length
        ? `<option value="">Select product</option>${matching.map(p =>
            `<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`
          ).join("")}`
        : `<option value="">No ${selectedCategory === "finished" ? "finished" : "semi-finished"} products available</option>`;

      submit.disabled = true;
      panel.className = "alert warning";
      panel.textContent = matching.length
        ? "Select a product and quantity to check availability."
        : "No active products found for this product type.";
    }

    async function checkAvailability() {
      const seq = ++requestSequence;
      submit.disabled = true;
      const qty = Number(quantity.value);

      if (!product.value || !Number.isFinite(qty) || qty <= 0) {
        panel.className = "alert warning";
        panel.textContent = "Select a product and enter a quantity greater than zero.";
        return;
      }

      panel.className = "alert warning";
      panel.textContent = "Checking live inventory and BOM materials…";

      try {
        const result = await API.orders.availability(product.value, qty, fulfilment.value);
        if (seq !== requestSequence) return;

        const materials = (result.materials || []).map(item => `
          <div><strong>${esc(item.name)}</strong>:
            required ${num(item.required)} ${esc(item.unit)}
            · available ${num(item.available)} ${esc(item.unit)}
            — ${item.sufficient ? "Sufficient" : "INSUFFICIENT"}
          </div>`).join("");

        panel.className = result.available ? "alert success" : "alert danger";
        panel.innerHTML = `
          <strong>${esc(result.message || "Availability checked.")}</strong>
          ${fulfilment.value === "readymade"
            ? `<div>Available stock: ${num(result.finished_stock)} ${esc(result.unit || "")} · Requested: ${num(result.required)} ${esc(result.unit || "")}</div>`
            : `<div>Manufactured order: BOM materials will be reserved when the order is accepted.</div>`}
          ${materials}`;
        submit.disabled = !result.available;
      } catch (error) {
        if (seq !== requestSequence) return;
        panel.className = "alert danger";
        panel.textContent = error.message;
        submit.disabled = true;
      }
    }

    function scheduleAvailability() {
      clearTimeout(timer);
      submit.disabled = true;
      timer = setTimeout(checkAvailability, 250);
    }

    category.addEventListener("change", () => {
      refreshProducts();
      scheduleAvailability();
    });
    [product, quantity].forEach(el => {
      el.addEventListener("change", scheduleAvailability);
      el.addEventListener("input", scheduleAvailability);
    });

    refreshProducts();

    form.onsubmit = async event => {
      event.preventDefault();
      if (submit.disabled) return;

      submit.disabled = true;
      submit.textContent = "Creating Order…";

      const data = Object.fromEntries(new FormData(form));
      data.order_type = "manufactured";
      data.product = Number(data.product);
      data.quantity = Number(data.quantity);
      delete data.product_category; // classification is represented by the selected Product.

      data.vendor_emails = String(data.vendor_emails || "")
        .split(/[\s,;]+/)
        .map(email => email.trim())
        .filter(Boolean);
      data.vendor_email = data.vendor_emails[0] || "";
      delete data.sender_email;

      try {
        const result = await API.orders.create(data);
        const notification = result.notifications || {};
        const emailStatus = (notification.email || {}).status || "not_requested";
        const recipients = (notification.email || {}).recipient_count || data.vendor_emails.length;
        toast(`Order created successfully. Email notifications: ${emailStatus}.`);

        if (result.production_created) {
          state.page = "production";
          document.querySelector('[data-page="production"]')?.click();
        } else {
          await loadPage("orders");
        }
      } catch (error) {
        toast(error.message, "error");
        submit.textContent = "Create Order";
        await checkAvailability();
      }
    };
  }

  function renderProduction(){
    pageEl.innerHTML=`<div class="section-head"><div><h2>Production Queue</h2><p class="muted">Work orders, output and completion.</p></div><button class="btn primary" data-action="add">+ Start Production</button></div>
      <div class="search-toolbar"><input id="productionSearch" type="search" placeholder="Search job, product, customer or operator..."></div>
      <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Job</th><th>Product</th><th>Customer</th><th>Qty</th><th>Produced</th><th>Operator</th><th>Status</th><th>Action</th></tr></thead><tbody id="productionRows">${state.production.length?state.production.map(p=>`<tr><td>${esc(p.production_number)}</td><td>${esc(p.product_name)}</td><td>${esc(p.customer_name||"-")}</td><td>${num(p.quantity)}</td><td>${num(p.produced_quantity)}</td><td>${esc(p.assigned_to||"-")}</td><td>${badge(p.status)}</td><td>${p.status!=="completed"?`<button class="btn small" data-complete="${p.id}">Complete</button>`:"—"}</td></tr>`).join(""):`<tr><td colspan="8">${empty()}</td></tr>`}</tbody></table></div></div>`;
    bindTableSearch("productionSearch","productionRows");
    pageEl.querySelector('[data-action="add"]').onclick=addProduction;
    pageEl.querySelectorAll("[data-complete]").forEach(b=>b.onclick=async()=>{try{await API.production.complete(b.dataset.complete);toast("Production completed.");loadPage("production")}catch(e){toast(e.message,"error")}});
  }
  function addProduction(){
    const options=state.products.filter(p=>p.product_type==="finished").map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
    const m=modal("Start Production",`<form id="productionForm" class="form-grid">
      <div class="field"><label>Finished product</label><select name="product">${options}</select></div>
      ${field("Customer","customer_name","text","Optional")}${field("Quantity","quantity","number","1",true)}${field("Assigned operator","assigned_to","text","Operator name")}
      <div class="field full"><button class="btn primary" type="submit">Start Production</button></div></form>`);
    m.querySelector("#productionForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.product=Number(d.product);d.quantity=Number(d.quantity);try{await API.production.create(d);m.remove();toast("Production job started.");loadPage("production")}catch(ex){toast(ex.message,"error")}};
  }

  function renderBOM(){
    const options=state.products.filter(p=>p.product_type!=="raw-material").map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join("");
    pageEl.innerHTML=`<div class="section-head"><div><h2>Bill of Materials</h2><p class="muted">Choose a finished or semi-finished product to view and manage only its materials.</p></div></div>
      <div class="card"><div class="card-body"><div class="field" style="max-width:520px;margin-top:10px"><label>Product</label><select id="bomProduct"><option value="">Select a product to view/edit BOM</option>${options}</select></div></div></div>
      <div id="bomContent" class="card" style="margin-top:16px">${empty("Select a product above to view or edit its bill of materials.")}</div>
      <div class="alert info" style="margin-top:16px">BOM quantities are used for live material checks during order creation. Material stock is consumed atomically when a manufactured order is accepted.</div>`;
    const selectProduct=$("#bomProduct");selectProduct.onchange=draw;
    function draw(){const id=selectProduct.value;if(!id){$("#bomContent").innerHTML=empty("Select a product above to view or edit its bill of materials.");return;}const rows=state.bom.filter(x=>String(x.product)===String(id));
      $("#bomContent").innerHTML=`<div class="section-head"><div><h2>Material Requirements — ${esc(state.products.find(p=>String(p.id)===String(id))?.name||"")}</h2><p class="muted">Set the quantity of each component needed for one finished unit.</p></div><button class="btn primary" data-add-bom>+ Add Material</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Raw Material</th><th>Quantity per Unit</th><th>Unit</th><th>Actions</th></tr></thead><tbody>${rows.length?rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.component_name)}</td><td>${num(x.quantity_per_unit,4)}</td><td>${esc(x.unit)}</td><td><div class="actions"><button class="btn small" data-edit-bom="${x.id}">Edit</button><button class="btn small danger" data-delete-bom="${x.id}">Delete</button></div></td></tr>`).join(""):`<tr><td colspan="5">${empty("No BOM materials defined for this product yet.")}</td></tr>`}</tbody></table></div>`;
      $("#bomContent [data-add-bom]").onclick=()=>addBOM(id);
      pageEl.querySelectorAll("#bomContent [data-delete-bom]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this BOM item?"))return;try{await API.bom.remove(b.dataset.deleteBom);state.bom=await API.bom.list();draw();toast("BOM item deleted.")}catch(e){toast(e.message,"error")}});
      pageEl.querySelectorAll("#bomContent [data-edit-bom]").forEach(b=>b.onclick=()=>editBOM(b.dataset.editBom));
    }
    async function addBOM(productId){
      const components=state.products.filter(p=>String(p.id)!==String(productId)&&p.product_type!=="finished"&&p.is_active!==false);
      const componentOptions=components.map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join("");
      const m=modal("Add BOM Material",`<form id="bomForm" class="form-grid"><div class="field full"><label>Raw material / component</label><select name="component_product" required>${componentOptions}</select></div>${field("Quantity per Unit","quantity_per_unit","number","1",true)}${select("Unit","unit",["pcs","kg","g","m","roll","boxes"])}<div class="field full"><button class="btn primary" type="submit">Save Material</button></div></form>`);
      m.querySelector("#bomForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.product=Number(productId);d.component_product=Number(d.component_product);d.quantity_per_unit=Number(d.quantity_per_unit);try{await API.bom.create(d);state.bom=await API.bom.list();m.remove();draw();toast("BOM material saved.")}catch(ex){toast(ex.message,"error")}};
    }
    function editBOM(id){const item=state.bom.find(x=>String(x.id)===String(id));if(!item)return;const components=state.products.filter(p=>(String(p.id)!==String(item.product)||String(p.id)===String(item.component_product))&&p.product_type!=="finished"&&p.is_active!==false);const opts=components.map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join("");const m=modal("Edit BOM Material",`<form id="bomEditForm" class="form-grid"><div class="field full"><label>Raw material / component</label><select name="component_product" required>${opts}</select></div>${field("Quantity per Unit","quantity_per_unit","number","1",true)}${select("Unit","unit",["pcs","kg","g","m","roll","boxes"])}<div class="field full"><button class="btn primary" type="submit">Save Changes</button></div></form>`);const f=m.querySelector("#bomEditForm");f.elements.component_product.value=item.component_product;f.elements.quantity_per_unit.value=item.quantity_per_unit;f.elements.unit.value=item.unit;f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));d.component_product=Number(d.component_product);d.quantity_per_unit=Number(d.quantity_per_unit);try{await API.bom.update(id,d);state.bom=await API.bom.list();m.remove();draw();toast("BOM material updated.")}catch(ex){toast(ex.message,"error")}}}
  }

  // Show the warehouse movement ledger returned by the backend.
  function renderWarehouse(){
    pageEl.innerHTML=`<div class="section-head"><div><h2>Warehouse</h2><p class="muted">Track inward, putaway, picking, packing and dispatch.</p></div><button class="btn primary" data-action="add">+ Record Movement</button></div>
    <div class="search-toolbar"><input id="warehouseSearch" type="search" placeholder="Search product, movement, reference or notes..."></div>
    <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Product</th><th>Movement</th><th>Qty</th><th>Reference</th><th>Notes</th></tr></thead><tbody id="warehouseRows">${state.warehouse.length?state.warehouse.map(x=>`<tr><td>${date(x.created_at)}</td><td>${esc(x.product_name)}</td><td>${badge(x.transaction_type)}</td><td>${num(x.quantity)}</td><td>${esc(x.reference)}</td><td>${esc(x.notes)}</td></tr>`).join(""):`<tr><td colspan="6">${empty()}</td></tr>`}</tbody></table></div></div>`;
    bindTableSearch("warehouseSearch","warehouseRows");
    pageEl.querySelector('[data-action="add"]').onclick=addWarehouse;
  }
  // Collect a warehouse movement and submit it through the authenticated API.
  function addWarehouse(){
    const options=state.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
    const m=modal("Warehouse Movement",`<form id="warehouseForm" class="form-grid">
      <div class="field"><label>Product</label><select name="product">${options}</select></div>
      ${select("Movement","transaction_type",["inward","putaway","pick","pack","dispatch","return-receive"])}
      ${field("Quantity","quantity","number","1",true)}${field("Reference","reference","text","Order / GRN / Dispatch number")}
      ${field("Notes","notes","text","Optional")}
      <div class="field full"><button class="btn primary" type="submit">Save Movement</button></div></form>`);
    m.querySelector("#warehouseForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.product=Number(d.product);d.quantity=Number(d.quantity);try{await API.warehouse.create(d);m.remove();toast("Warehouse movement saved.");loadPage("warehouse")}catch(ex){toast(ex.message,"error")}};
  }

  // Render return cases and expose the next workflow action for each case.
  function renderReturns(){
    const labels={requested:"Return Created",received:"Return Accepted",inspection:"Mark Packed",repair:"Dispatched",replacement:"Delivered",redelivery:"Return Completed",closed:"Return Completed"};
    pageEl.innerHTML=`<div class="section-head"><div><h2>Returns</h2><p class="muted">Return Created → Return Accepted → Mark Packed → Dispatched → Delivered → Return Completed.</p></div><button class="btn primary" data-action="add">+ New Return</button></div>
    <div class="search-toolbar"><input id="returnsSearch" type="search" placeholder="Search order, customer, product, reason or status..."></div>
    <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Reason</th><th>Status</th><th>Mode</th><th>Action</th></tr></thead><tbody id="returnsRows">${state.returns.length?state.returns.map(x=>{const next=["requested","received","inspection","repair","replacement","redelivery","closed"][Math.min(["requested","received","inspection","repair","replacement","redelivery","closed"].indexOf(x.status)+1,6)];return `<tr><td>${esc(x.order_number)}</td><td>${esc(x.customer_name)}</td><td>${esc(x.product_name)}</td><td>${esc(x.reason)}</td><td>${badge(labels[x.status]||x.status)}</td><td>${esc(x.replacement_mode)}</td><td>${x.status!=="closed"?`<select class="form-control return-action-select" data-return-action="${x.id}"><option value="">Select action</option><option value="${next}">${labels[next]||next}</option></select>`:"Completed"}</td></tr>`}).join(""):`<tr><td colspan="7">${empty()}</td></tr>`}</tbody></table></div></div>`;
    bindTableSearch("returnsSearch","returnsRows");
    pageEl.querySelector('[data-action="add"]').onclick=addReturn;
    pageEl.querySelectorAll("[data-return-action]").forEach(sel=>sel.onchange=async()=>{const status=sel.value;if(!status)return;sel.disabled=true;try{await API.returns.update(sel.dataset.returnAction,{status});toast("Return status updated.");loadPage("returns")}catch(e){toast(e.message,"error");sel.disabled=false;sel.value=""}});
  }
  function addReturn(){
    const options=state.orders.map(o=>`<option value="${o.id}">${esc(o.order_number)} — ${esc(o.customer_name)}</option>`).join("");
    const m=modal("Create Return",`<form id="returnForm" class="form-grid">
      <div class="field full"><label>Order</label><select name="order">${options}</select></div>
      ${field("Returned quantity", "return_quantity", "number", "Defaults to full order quantity", true)}
      <div class="field full"><label>Return reason</label><textarea name="reason" required></textarea></div>
      <div class="field full"><label>Damage notes</label><textarea name="damage_notes"></textarea></div>
      ${select("Resolution","replacement_mode",["repair","replacement","refund"])}
      <div class="field full"><button class="btn primary" type="submit">Create Return</button></div></form>`);
    m.querySelector("#returnForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.order=Number(d.order);try{if(!d.return_quantity)d.return_quantity=state.orders.find(o=>String(o.id)===String(d.order))?.quantity||1;d.return_quantity=Number(d.return_quantity);await API.returns.create(d);m.remove();toast("Return created.");loadPage("returns")}catch(ex){toast(ex.message,"error")}};
  }
  async function nextReturn(id){
    const steps=["requested","received","inspection","repair","replacement","redelivery","closed"];
    const item=state.returns.find(x=>String(x.id)===String(id));if(!item)return;
    const next=steps[Math.min(steps.indexOf(item.status)+1,steps.length-1)];
    try{await API.returns.update(id,{status:next});toast("Return updated.");loadPage("returns")}catch(e){toast(e.message,"error")}
  }

  // Display stock batches in oldest-received-first order as supplied by Django.
  function renderFIFO(){
    pageEl.innerHTML=`<div class="section-head"><div><h2>FIFO Batches</h2><p class="muted">Oldest stock is consumed before newer stock.</p></div><button class="btn primary" data-action="consume">Consume FIFO</button></div>
    <div class="search-toolbar"><input id="fifoSearch" type="search" placeholder="Search batch, product, vendor or date..."></div>
    <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Batch</th><th>Product</th><th>Received</th><th>Vendor</th><th>Original Qty</th><th>Remaining</th><th>Expiry</th></tr></thead><tbody id="fifoRows">${state.batches.length?state.batches.map(b=>`<tr><td>${esc(b.batch_code)}</td><td>${esc(b.product_name)}</td><td>${date(b.received_date)}</td><td>${esc(b.vendor||"-")}</td><td>${num(b.quantity)}</td><td>${num(b.remaining_quantity)}</td><td>${date(b.expiry_date)}</td></tr>`).join(""):`<tr><td colspan="7">${empty("No batch records yet. Receive stock to create batches.")}</td></tr>`}</tbody></table></div></div>`;
    bindTableSearch("fifoSearch","fifoRows");
    pageEl.querySelector('[data-action="consume"]').onclick=consumeFIFO;
  }
  function consumeFIFO(){
    const options=state.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
    const m=modal("FIFO Stock Consumption",`<form id="fifoForm" class="form-grid"><div class="field full"><label>Product</label><select name="product">${options}</select></div>${field("Quantity","quantity","number","1",true)}${field("Reference","reference","text","Production / Pick number")}<div class="field full"><button class="btn primary">Consume Oldest Stock</button></div></form>`);
    m.querySelector("#fifoForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.product=Number(d.product);d.quantity=Number(d.quantity);try{const r=await API.inventory.consume(d);toast(`FIFO consumed: ${r.allocations.map(x=>x.batch+" ("+x.quantity+")").join(", ")}`);m.remove();loadPage("fifo")}catch(ex){toast(ex.message,"error")}};
  }

  // Reports use the normalized stock/order/production/return counts from API.
  async function renderReports(data){
    pageEl.innerHTML=`<div id="reportCards"><div class="grid grid-3">${kpi("Low Stock",data.stock.low_stock,"At/below minimum",data.stock.low_stock?"danger":"success")}${kpi("Dead Stock",data.stock.dead_stock,"No movement in 90 days")}${kpi("Near Expiry",data.stock.near_expiry,"Within 30 days","warning")}</div>
      <div class="grid grid-3" style="margin-top:16px">
      ${simpleReport("Orders",data.orders_by_status)}${simpleReport("Production",data.production_by_status)}${simpleReport("Returns",data.returns_by_status)}</div></div>`;
  }
  function simpleReport(title,obj){return `<div class="card"><h2>${title}</h2><div class="chart-bars">${Object.entries(obj).map(([k,v])=>bar(k,v,Math.max(1,...Object.values(obj)))).join("")}</div></div>`}


async function renderNotifications(
    fromDate = "",
    toDate = "",
    notificationType = "all",
    searchTerm = ""
) {
    try {
        const rows = await API.notifications.list();

        function getLocalDate(value) {
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return "";

            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");

            return `${year}-${month}-${day}`;
        }

        const filteredRows = rows.filter(n => {
            const notificationDate = getLocalDate(n.created_at);

            if (!notificationDate) return false;
            if (fromDate && notificationDate < fromDate) return false;
            if (toDate && notificationDate > toDate) return false;

            if (
                notificationType !== "all" &&
                String(n.title || "").trim().toLowerCase() !==
                notificationType.toLowerCase()
            ) {
                return false;
            }

            const searchText = [
                n.title,
                n.message,
                n.kind,
                n.id
            ].join(" ").toLowerCase();

            if (
                searchTerm &&
                !searchText.includes(searchTerm.trim().toLowerCase())
            ) {
                return false;
            }

            return true;
        });

        pageEl.innerHTML = `
            <div class="section-head">
                <div>
                    <div class="notification-heading">
                        <h2>Notifications</h2>

                        <select id="notificationTypeFilter"
                                class="notification-type-select">
                            <option value="all"
                                ${notificationType === "all" ? "selected" : ""}>
                                All Notifications
                            </option>
                            <option value="Production completed"
                                ${notificationType === "Production completed" ? "selected" : ""}>
                                Production completed
                            </option>
                            <option value="New order created"
                                ${notificationType === "New order created" ? "selected" : ""}>
                                New order created
                            </option>
                            <option value="Order status updated"
                                ${notificationType === "Order status updated" ? "selected" : ""}>
                                Order status updated
                            </option>
                        </select>
                    </div>

                    <p class="muted">
                        Order workflow, stock checks and system activity.
                    </p>
                </div>

                <div class="actions">
                    <button class="btn" data-read-all>Mark All as Read</button>
                    <button class="btn danger" data-clear-all>Clear All</button>
                </div>
            </div>

            <div class="card notification-filters">

                <div class="filters">
                    <div class="field">
                        <label for="notificationFrom">From Date</label>
                        <input type="date" id="notificationFrom"
                               value="${esc(fromDate)}">
                    </div>

                    <div class="field">
                        <label for="notificationTo">To Date</label>
                        <input type="date" id="notificationTo"
                               value="${esc(toDate)}">
                    </div>

                    <button class="btn primary" id="applyNotificationFilter">
                        Apply Filter
                    </button>

                    <button class="btn" id="resetNotificationFilter">
                        Reset
                    </button>
                </div>

                <div class="notification-search">
                    <input
                        type="search"
                        id="notificationSearch"
                        placeholder="Search order ID, notification or details..."
                        value="${esc(searchTerm)}"
                    >
                    <span class="search-icon">⌕</span>
                </div>

                <p class="muted">
                    <span data-notification-count>Showing ${filteredRows.length} matching notifications</span>
                </p>
            </div>

            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Notification</th>
                                <th>Details</th>
                                <th>Time</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${filteredRows.length ? filteredRows.map(n => `
                                <tr>
                                    <td>${badge(n.kind)}</td>
                                    <td><strong>${esc(n.title)}</strong></td>
                                    <td>${esc(n.message)}</td>
                                    <td>${new Date(n.created_at).toLocaleString("en-IN")}</td>
                                    <td>${badge(n.is_read ? "read" : "unread")}</td>
                                    <td>
                                        ${n.is_read ? "—" : `
                                            <button class="btn small"
                                                    data-read="${esc(n.id)}">
                                                Mark Read
                                            </button>
                                        `}
                                    </td>
                                </tr>
                            `).join("") : `
                                <tr>
                                    <td colspan="6">
                                        ${empty("No matching notifications found.")}
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Apply date filter
        $("#applyNotificationFilter").onclick = () => {
            const from = $("#notificationFrom").value;
            const to = $("#notificationTo").value;

            if (from && to && from > to) {
                toast("From Date cannot be later than To Date.", "error");
                return;
            }

            renderNotifications(
                from,
                to,
                $("#notificationTypeFilter").value,
                $("#notificationSearch").value
            );
        };

        // Reset all filters
        $("#resetNotificationFilter").onclick = () => {
            renderNotifications("", "", "all", "");
        };

        // Notification type filter
        $("#notificationTypeFilter").onchange = () => {
            renderNotifications(
                $("#notificationFrom").value,
                $("#notificationTo").value,
                $("#notificationTypeFilter").value,
                $("#notificationSearch").value
            );
        };

        // Filter the already-rendered rows while typing. Re-rendering the
        // whole page on every keystroke steals focus after the first character.
        $("#notificationSearch").oninput = event => {
            const query = event.target.value.trim().toLocaleLowerCase();
            const tableRows = pageEl.querySelectorAll(".data-table tbody tr");
            let visibleCount = 0;
            tableRows.forEach(row => {
                const matches = !query || row.textContent.toLocaleLowerCase().includes(query);
                row.hidden = !matches;
                if (matches) visibleCount++;
            });
            const countLabel = pageEl.querySelector("[data-notification-count]");
            if (countLabel) countLabel.textContent = `Showing ${visibleCount} matching notifications`;
        };

        // Mark all as read
        pageEl.querySelector("[data-read-all]").onclick = async () => {
            try {
                await API.notifications.action("read_all");
                await renderNotifications(
                    fromDate, toDate, notificationType, searchTerm
                );
            } catch (e) {
                toast(e.message, "error");
            }
        };

        // Clear all notifications
        pageEl.querySelector("[data-clear-all]").onclick = async () => {
            if (!confirm("Clear all notifications?")) return;

            try {
                await API.notifications.action("clear_all");
                await renderNotifications("", "", "all", "");
            } catch (e) {
                toast(e.message, "error");
            }
        };

        // Mark individual notification as read
        pageEl.querySelectorAll("[data-read]").forEach(button => {
            button.onclick = async () => {
                try {
                    await API.notifications.action("read", button.dataset.read);

                    await renderNotifications(
                        fromDate, toDate, notificationType, searchTerm
                    );
                } catch (e) {
                    toast(e.message, "error");
                }
            };
        });

    } catch (e) {
        toast(e.message, "error");
        console.error("Notification error:", e);
    }
}

// Shared helper: Order table
function orderTable(rows = []) {
    return rows.length
        ? `<div class="table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(o => `
                        <tr>
                            <td>${esc(o.order_number)}</td>
                            <td>${esc(o.customer_name)}</td>
                            <td>${esc(o.product__name || o.product_name)}</td>
                            <td>${num(o.quantity)}</td>
                            <td>${badge(o.status)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>`
        : empty();
}

// Shared helper: Input field
function field(label, name, type = "text", placeholder = "", required = false) {
    const numericAttributes = type === "number" ? 'min="0" step="any" inputmode="decimal"' : "";
    return `
        <div class="field">
            <label>${esc(label)}</label>
            <input
                name="${esc(name)}"
                type="${esc(type)}"
                placeholder="${esc(placeholder)}"
                ${numericAttributes}
                ${required ? "required" : ""}
            >
        </div>
    `;
}

// Shared helper: Select dropdown
function select(label, name, values = []) {
    return `
        <div class="field">
            <label>${esc(label)}</label>
            <select name="${esc(name)}">
                ${values.map(v => `
                    <option value="${esc(v)}">
                        ${esc(v.replaceAll("-", " "))}
                    </option>
                `).join("")}
            </select>
        </div>
    `;
}

  // First screen.
  loadPage("dashboard");
});
