document.addEventListener("DOMContentLoaded", async()=>{
  if(!Auth.isAuthenticated()){location.replace("/app/login.html");return;}
  let me;
  try {
    me = await API.auth.me();
    localStorage.setItem("seaon_user", JSON.stringify(me));
  } catch (error) {
    Auth.clearSession();
    location.replace("/app/login.html");
    return;
  }
  if(!["super-admin","admin"].includes(me?.role)){location.replace("/app/index.html");return;}
  const page=document.querySelector("#adminPage");
  const toast=(m,type="success")=>{const x=document.createElement("div");x.className=`toast ${type}`;x.textContent=m;document.querySelector("#adminToast").appendChild(x);setTimeout(()=>x.remove(),3500)};
  const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const state={roles:[],permissions:[],users:[]};

  document.querySelector("#adminUser").textContent=me.full_name||me.email;
  if(me.role!=="super-admin") document.querySelector('#adminNav [data-section="users"]')?.classList.add("hidden");
  // Apply saved branding on the admin page too, not only the main ERP screen.
  API.branding.get().then(applyAdminBranding).catch(()=>{});
  function applyAdminBranding(b){
    const mark=document.querySelector(".brand-mark");
    if(mark){mark.textContent=b.logo_text||"S";mark.style.background=b.logo_color||"#2563eb";mark.style.borderRadius=b.logo_style==="circle"?"50%":b.logo_style==="square"?"4px":"12px";}
    const title=document.querySelector(".brand strong");if(title)title.textContent=b.company_name||"SEAON ERP";
    const tagline=document.querySelector(".brand small");if(tagline)tagline.textContent=b.tagline||"Manufacturing & Stock";
  }
  document.querySelectorAll("#adminNav [data-section]").forEach(b=>b.onclick=()=>{document.querySelectorAll("#adminNav .nav-item").forEach(x=>x.classList.remove("active"));b.classList.add("active");load(b.dataset.section)});

  async function load(section){
    page.innerHTML=`<div class="card"><div class="empty">Loading...</div></div>`;
    try{
      if(section==="overview")return overview();
      if(section==="users"){state.users=await adminAPI.users();state.roles=await adminAPI.roles();return users();}
      if(section==="roles"){state.roles=await adminAPI.roles();state.permissions=await adminAPI.permissions();return roles();}
      if(section==="branding")return branding(await adminAPI.branding());
      if(section==="stock")return stock(await adminAPI.stock());
      if(section==="audit")return audit(await adminAPI.audit());
    }catch(e){page.innerHTML=`<div class="card"><div class="error-box">${esc(e.message)}</div></div>`}
  }

  async function overview(){
    const d=await adminAPI.summary();
    page.innerHTML=`<div class="grid grid-4">${k("Users",d.users)}${k("Active Users",d.active_users)}${k("Roles",d.roles)}${k("Audit Events",d.audit_events)}</div>
      <div class="grid grid-2" style="margin-top:16px"><div class="card"><h2>Simple admin workflow</h2><p class="muted">1. Create users → 2. Assign a role → 3. Adjust permissions → 4. Review audit logs.</p></div>
      <div class="card"><h2>Imported stock</h2><strong style="font-size:30px">${d.stock_rows}</strong><p class="muted">Rows imported from the supplied Excel sheets.</p></div></div>`;
  }
  function k(label,v){return `<div class="kpi"><div class="label">${label}</div><strong>${Number(v||0).toLocaleString("en-IN")}</strong></div>`}


  async function branding(b){
    page.innerHTML=`<div class="section-head"><div><h2>Logo & Company Branding</h2><p class="muted">Use the fixed SEAON logo component and customize its initials, color and shape.</p></div></div>
      <div class="card"><form id="brandingForm" class="form-grid">
        ${f("Company name","company_name","text","SEAON",true)}${f("Tagline","tagline","text","Manufacturing & Stock")}
        ${f("Logo text (up to 5 characters)","logo_text","text","S",true)}
        <div class="field"><label>Logo background color</label><input name="logo_color" type="color" value="${esc(b.logo_color||"#2563eb")}" required></div>
        <div class="field"><label>Logo shape</label><select name="logo_style"><option value="rounded">Rounded square</option><option value="circle">Circle</option><option value="square">Square</option></select></div>
        <div class="field full"><div style="display:flex;align-items:center;gap:12px"><div id="logoPreview" class="brand-mark" style="background:${esc(b.logo_color||"#2563eb")};border-radius:${b.logo_style==="circle"?"50%":b.logo_style==="square"?"4px":"12px"}">${esc(b.logo_text||"S")}</div><div><strong id="brandPreviewName">${esc(b.company_name||"SEAON")}</strong><div id="brandPreviewTagline" class="muted">${esc(b.tagline||"")}</div></div></div></div>
        <div class="field full"><button class="btn primary" type="submit">Save Branding</button></div>
      </form></div>`;
    const form=page.querySelector("#brandingForm");form.elements.company_name.value=b.company_name||"SEAON";form.elements.tagline.value=b.tagline||"Manufacturing & Stock";form.elements.logo_text.value=b.logo_text||"S";form.elements.logo_style.value=b.logo_style||"rounded";
    const updatePreview=()=>{const text=form.elements.logo_text.value.trim().slice(0,5)||"S",color=form.elements.logo_color.value,shape=form.elements.logo_style.value;const mark=page.querySelector("#logoPreview");mark.textContent=text;mark.style.background=color;mark.style.borderRadius=shape==="circle"?"50%":shape==="square"?"4px":"12px";page.querySelector("#brandPreviewName").textContent=form.elements.company_name.value||"SEAON";page.querySelector("#brandPreviewTagline").textContent=form.elements.tagline.value||""};
    form.addEventListener("input",updatePreview);form.addEventListener("change",updatePreview);
    form.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form));d.logo_text=d.logo_text.trim().slice(0,5)||"S";try{await adminAPI.saveBranding(d);toast("Branding saved. The logo and company identity are now updated.");applyAdminBranding(await adminAPI.branding());load("branding")}catch(ex){toast(ex.message,"error")}};
  }

  function users(){
    const roleOptions = user => state.roles.map(role => `
      <option value="${esc(role.name)}" ${role.name===user.role?"selected":""}>
        ${esc(role.name)}
      </option>
    `).join("");

    page.innerHTML=`
      <div class="section-head">
        <div><h2>Users</h2><p class="muted">Create accounts and assign database-backed roles.</p></div>
      </div>
      <div class="card">
        <form id="userForm" class="form-grid">
          ${f("Full name","full_name","text","e.g. Rahul Sharma",true)}
          ${f("Email","email","email","name@company.com",true)}
          ${f("Temporary password","password","password","Minimum 8 characters",true)}
          <div class="field"><label for="newUserRole">Role</label>
            <select id="newUserRole" name="role" required>
              ${state.roles.filter(r=>me.role==="super-admin" || r.name!=="super-admin").map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field full"><button class="btn primary" type="submit">Create User</button></div>
        </form>
      </div>
      <div class="card admin-table-card" style="margin-top:16px">
        <div class="table-wrap">
          <table class="data-table admin-users-table">
            <thead><tr><th>Name</th><th>Email</th><th>Assigned Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${state.users.map(user=>`
                <tr>
                  <td>${esc(user.full_name||"-")}</td>
                  <td>${esc(user.email)}</td>
                  <td>
                    <select class="admin-role-select" data-role-user="${user.id}" ${user.role==="super-admin" && me.role!=="super-admin"?"disabled":""}>
                      ${roleOptions(user)}
                    </select>
                  </td>
                  <td>${user.is_active?'<span class="badge success">Active</span>':'<span class="badge danger">Inactive</span>'}</td>
                  <td class="admin-user-actions">
                    <button class="btn small primary" data-save-role="${user.id}" ${user.role==="super-admin" && me.role!=="super-admin"?"disabled":""}>Save Role</button>
                    ${user.email===me.email?"":`<button class="btn small" data-user="${user.id}" data-active="${user.is_active}">${user.is_active?"Deactivate":"Activate"}</button><button class="btn small danger" data-delete-user="${user.id}">Delete</button>`}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>`;

    page.querySelector("#userForm").onsubmit=async event=>{
      event.preventDefault();
      const data=Object.fromEntries(new FormData(event.target));
      try { await adminAPI.createUser(data); toast("User created and role assigned."); await load("users"); }
      catch(error){ toast(error.message,"error"); }
    };

    page.querySelectorAll("[data-save-role]").forEach(button=>button.onclick=async()=>{
      const userId=button.dataset.saveRole;
      const select=page.querySelector(`[data-role-user="${userId}"]`);
      if(!select) return;
      button.disabled=true;
      try {
        await adminAPI.updateUser(userId,{role:select.value});
        toast("User role updated. New permissions will be loaded from the database on the user's next request/login.");
        await load("users");
      } catch(error){ toast(error.message,"error"); button.disabled=false; }
    });

    page.querySelectorAll("[data-user]").forEach(button=>button.onclick=async()=>{
      try {
        await adminAPI.updateUser(button.dataset.user,{is_active:button.dataset.active!=="true"});
        toast("User status updated.");
        await load("users");
      } catch(error){ toast(error.message,"error"); }
    });
    page.querySelectorAll("[data-delete-user]").forEach(button=>button.onclick=async()=>{
      if(!confirm("Permanently delete this user account? This cannot be undone.")) return;
      try { await adminAPI.deleteUser(button.dataset.deleteUser); toast("User permanently deleted."); await load("users"); }
      catch(error){ toast(error.message,"error"); }
    });
  }

  function groupPermissions() {
    const groups = new Map();

    (state.permissions || []).forEach(permission => {
      const moduleName = String(
        permission.module || String(permission.code || "").split(".")[0] || "Other"
      ).trim();

      if (!groups.has(moduleName)) groups.set(moduleName, []);
      groups.get(moduleName).push(permission);
    });

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moduleName, permissions]) => ({
        moduleName,
        permissions: permissions.sort((a, b) =>
          String(a.label).localeCompare(String(b.label))
        )
      }));
  }

  function permissionDropdowns(selected = [], readOnly = false) {
    const selectedSet = new Set(selected || []);
    const groups = groupPermissions();

    if (!groups.length) {
      return `<div class="role-permission-empty">No permissions are available from the backend catalogue.</div>`;
    }

    return `
      <div class="role-permission-dropdowns ${readOnly ? "is-readonly" : ""}">
        ${groups.map((group, index) => {
          const selectedCount = group.permissions.filter(item =>
            selectedSet.has(item.code)
          ).length;

          return `
            <details class="role-permission-dropdown">
              <summary>
                <span class="role-permission-module">${esc(group.moduleName)}</span>
                <span class="role-permission-count" data-permission-count>
                  ${selectedCount} selected
                </span>
                <span class="role-permission-chevron" aria-hidden="true">⌄</span>
              </summary>

              <div class="role-permission-options">
                ${group.permissions.map(permission => `
                  <label class="role-permission-option">
                    <input
                      type="checkbox"
                      name="permission"
                      value="${esc(permission.code)}"
                      ${selectedSet.has(permission.code) ? "checked" : ""}
                      ${readOnly ? "disabled" : ""}
                    >
                    <span>
                      <strong>${esc(permission.label)}</strong>
                      <small>${esc(permission.code)}</small>
                    </span>
                  </label>
                `).join("")}
              </div>
            </details>
          `;
        }).join("")}
      </div>
    `;
  }

  function bindPermissionDropdowns(container) {
    container.querySelectorAll(".role-permission-dropdown").forEach(details => {
      const updateCount = () => {
        const count = details.querySelectorAll(
          'input[name="permission"]:checked'
        ).length;
        const badge = details.querySelector("[data-permission-count]");
        if (badge) badge.textContent = `${count} selected`;
      };

      details.querySelectorAll('input[name="permission"]').forEach(input => {
        input.addEventListener("change", updateCount);
      });

      updateCount();
    });
  }

  function checkedPermissionCodes(form) {
    return [...form.querySelectorAll(
      'input[name="permission"]:checked'
    )].map(input => input.value);
  }

  function roles() {
    page.innerHTML = `
      <div class="section-head">
        <div>
          <h2>Roles & Permissions</h2>
          <p class="muted">Create roles and choose the exact actions each role can access.</p>
        </div>
      </div>

      <div class="card role-create-card">
        <div class="role-form-heading">
          <h3>Create New Role</h3>
          <p class="muted">Choose a role name, describe its responsibility, then expand permission categories.</p>
        </div>

        <form id="roleForm">
          <div class="role-create-fields">
            <div class="field">
              <label for="newRoleName">Role name</label>
              <input id="newRoleName" name="name" maxlength="30"
                     placeholder="e.g. Quality Manager" required>
              <small class="muted">Maximum 30 characters.</small>
            </div>

            <div class="field">
              <label for="newRoleDescription">Description</label>
              <input id="newRoleDescription" name="description"
                     maxlength="255" placeholder="What this role does">
            </div>
          </div>

          <div class="field role-permissions-field">
            <div class="role-permissions-heading">
              <div>
                <label>Permissions</label>
                <small class="muted">Expand a category to select individual permissions.</small>
              </div>
              <span class="role-total-selected" id="newRolePermissionTotal">0 selected</span>
            </div>
            ${permissionDropdowns([])}
          </div>

          <div class="role-create-footer">
            <button class="btn primary" type="submit">Create Role</button>
          </div>
        </form>
      </div>

      <div class="card admin-table-card role-list-card">
        <div class="role-list-heading">
          <div>
            <h3>Existing Roles</h3>
            <p class="muted">Review permissions and edit custom or system roles.</p>
          </div>
          <span class="muted">${state.roles.length} roles</span>
        </div>

        <div class="table-wrap">
          <table class="data-table admin-roles-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Permission dropdown</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.roles.map(role => {
                const rolePermissions = role.permissions || [];
                const permissionNames = rolePermissions.map(code => {
                  const match = state.permissions.find(item => item.code === code);
                  return match ? match.label : code;
                });

                return `
                  <tr>
                    <td><strong>${esc(role.name)}</strong></td>
                    <td>${esc(role.description || "—")}</td>
                    <td>
                      <details class="role-row-permissions">
                        <summary>
                          <span>${rolePermissions.length} permissions</span>
                          <span aria-hidden="true">⌄</span>
                        </summary>
                        <div class="role-row-permission-list">
                          ${permissionNames.length
                            ? permissionNames.map(name => `<span>${esc(name)}</span>`).join("")
                            : `<span class="muted">No permissions assigned</span>`
                          }
                        </div>
                      </details>
                    </td>
                    <td>
                      ${role.is_system
                        ? '<span class="badge neutral">System</span>'
                        : '<span class="badge blue">Custom</span>'
                      }
                    </td>
                    <td>
                      ${role.name === "super-admin"
                        ? "—"
                        : `<button class="btn small" data-edit-role="${role.id}">Edit</button>`
                      }
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const roleForm = page.querySelector("#roleForm");
    bindPermissionDropdowns(roleForm);

    const updateCreateTotal = () => {
      const total = checkedPermissionCodes(roleForm).length;
      const target = roleForm.querySelector("#newRolePermissionTotal");
      if (target) target.textContent = `${total} selected`;
    };

    roleForm.addEventListener("change", event => {
      if (event.target.matches('input[name="permission"]')) {
        updateCreateTotal();
      }
    });

    roleForm.onsubmit = async event => {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(event.target));
      data.name = String(data.name || "").trim();
      data.description = String(data.description || "").trim();
      data.permissions = checkedPermissionCodes(event.target);

      if (!data.name) {
        toast("Enter a role name.", "error");
        return;
      }

      if (data.name.length > 30) {
        toast("Role name must be 30 characters or fewer.", "error");
        return;
      }

      const submitButton = roleForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = "Creating...";

      try {
        await adminAPI.createRole(data);
        toast("Role created and permissions saved.");
        await load("roles");
      } catch (error) {
        toast(error.message, "error");
        submitButton.disabled = false;
        submitButton.textContent = "Create Role";
      }
    };

    page.querySelectorAll("[data-edit-role]").forEach(button => {
      button.onclick = () => {
        const role = state.roles.find(
          item => String(item.id) === button.dataset.editRole
        );
        if (!role) return;

        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop show";

        backdrop.innerHTML = `
          <div class="modal role-edit-modal role-edit-dropdown-modal">
            <div class="modal-head">
              <div>
                <h2>Edit Role: ${esc(role.name)}</h2>
                <p class="muted">Changes are saved to the backend and apply to users assigned this role.</p>
              </div>
              <button class="close" type="button" data-close aria-label="Close">×</button>
            </div>

            <form id="editRoleForm">
              <div class="field">
                <label for="editRoleDescription">Description</label>
                <input id="editRoleDescription" name="description"
                       maxlength="255" value="${esc(role.description || "")}">
              </div>

              <div class="field role-permissions-field">
                <div class="role-permissions-heading">
                  <div>
                    <label>Permissions</label>
                    <small class="muted">Expand categories to add or remove permissions.</small>
                  </div>
                  <span class="role-total-selected" id="editRolePermissionTotal">
                    ${(role.permissions || []).length} selected
                  </span>
                </div>
                ${permissionDropdowns(role.permissions || [])}
              </div>

              <div class="role-edit-actions">
                <button type="button" class="btn" data-close>Cancel</button>
                <button class="btn primary" type="submit">Save Changes</button>
              </div>
            </form>
          </div>
        `;

        document.body.appendChild(backdrop);

        const editForm = backdrop.querySelector("#editRoleForm");
        bindPermissionDropdowns(editForm);

        const updateEditTotal = () => {
          const target = editForm.querySelector("#editRolePermissionTotal");
          if (target) {
            target.textContent = `${checkedPermissionCodes(editForm).length} selected`;
          }
        };

        editForm.addEventListener("change", event => {
          if (event.target.matches('input[name="permission"]')) {
            updateEditTotal();
          }
        });

        const closeEdit = () => backdrop.remove();

        backdrop.addEventListener("click", event => {
          if (
            event.target === backdrop ||
            event.target.closest("[data-close]")
          ) {
            closeEdit();
          }
        });

        editForm.onsubmit = async event => {
          event.preventDefault();

          const data = Object.fromEntries(new FormData(editForm));
          data.description = String(data.description || "").trim();
          data.permissions = checkedPermissionCodes(editForm);

          const saveButton = editForm.querySelector('button[type="submit"]');
          saveButton.disabled = true;
          saveButton.textContent = "Saving...";

          try {
            await adminAPI.updateRole(role.id, data);
            closeEdit();
            toast("Role and permissions updated successfully.");
            await load("roles");
          } catch (error) {
            toast(error.message, "error");
            saveButton.disabled = false;
            saveButton.textContent = "Save Changes";
          }
        };
      };
    });
  }

  function stock(rows){
    page.innerHTML=`<div class="section-head"><div><h2>Imported Stock</h2><p class="muted">This is the raw spreadsheet data kept for traceability.</p></div><button class="btn primary" id="reimport">Re-import Excel</button></div>
    <div class="filters"><input id="stockSearch" placeholder="Search item"></div>
    <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Category</th><th>Item</th><th>Size</th><th>Colour</th><th>Available</th><th>Minimum</th><th>Source</th></tr></thead><tbody id="stockRows"></tbody></table></div></div>`;
    const draw=()=>{const q=(document.querySelector("#stockSearch").value||"").toLowerCase();const r=rows.filter(x=>`${x.item_name} ${x.category} ${x.source_file}`.toLowerCase().includes(q));document.querySelector("#stockRows").innerHTML=r.map(x=>`<tr><td>${esc(x.category)}</td><td>${esc(x.item_name)}</td><td>${esc(x.size)}</td><td>${esc(x.color)}</td><td>${x.available_stock??"-"} ${esc(x.unit)}</td><td>${x.minimum_stock??"-"}</td><td>${esc(x.source_file)} / ${esc(x.source_sheet)} / row ${x.source_row||"-"}</td></tr>`).join("")||`<tr><td colspan="7">${empty()}</td></tr>`};
    document.querySelector("#stockSearch").oninput=draw;draw();
    document.querySelector("#reimport").onclick=async()=>{try{await adminAPI.reimport();toast("Excel data imported.");load("stock")}catch(e){toast(e.message,"error")}};
  }

  function audit(rows){
    page.innerHTML=`<div class="section-head"><div><h2>Audit Log</h2><p class="muted">Who changed what and when.</p></div></div><div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>User</th><th>Module</th><th>Action</th><th>Description</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString("en-IN")}</td><td>${esc(x.user)}</td><td>${esc(x.module)}</td><td>${esc(x.action)}</td><td>${esc(x.description)}</td></tr>`).join("")||`<tr><td colspan="5">${empty()}</td></tr>`}</tbody></table></div></div>`;
  }

  const f=(label,name,type,placeholder,required=false)=>`<div class="field"><label>${label}</label><input name="${name}" type="${type}" placeholder="${placeholder}" ${required?"required":""}></div>`;
  const empty=()=>`<div class="empty">No records.</div>`;
  const adminAPI={
    summary:()=>API.request("/admin/summary/"),users:()=>API.request("/admin/users/"),
    createUser:d=>API.request("/admin/users/",{method:"POST",body:JSON.stringify(d)}),
    updateUser:(id,d)=>API.request(`/admin/users/${id}/`,{method:"PATCH",body:JSON.stringify(d)}),
    deleteUser:id=>API.request(`/admin/users/${id}/`,{method:"DELETE"}),
    roles:()=>API.request("/admin/roles/"),permissions:()=>API.request("/admin/permissions/"),
    createRole:d=>API.request("/admin/roles/",{method:"POST",body:JSON.stringify(d)}),
    updateRole:(id,d)=>API.request(`/admin/roles/${id}/`,{method:"PATCH",body:JSON.stringify(d)}),
    stock:()=>API.request("/admin/stock/"),audit:()=>API.request("/admin/audit/"),
    reimport:()=>API.request("/admin/reimport/",{method:"POST"}),
    branding:()=>API.branding.get(),
    saveBranding:d=>API.branding.save(d)
  };
  document.querySelector("#adminLogout").onclick=()=>Auth.logout();
  load("overview");
});
