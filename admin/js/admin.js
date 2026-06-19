let currentPage = 'dashboard';

async function checkAuth() {
  try {
    const res = await fetch('/api/admin/me');
    if (!res.ok) { window.location.href = '/admin/login.html'; return; }
    const user = await res.json();
    document.getElementById('headerUser').textContent = user.name;
  } catch(e) { window.location.href = '/admin/login.html'; }
}

async function logout() {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/admin/login.html';
}

function loadPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (el) el.classList.add('active');

  const titles = { dashboard:'ড্যাশবোর্ড', orders:'অর্ডার ম্যানেজমেন্ট', products:'পণ্য ম্যানেজমেন্ট', categories:'ক্যাটেগরি', customers:'গ্রাহক ম্যানেজমেন্ট', coupons:'কুপন ম্যানেজমেন্ট', expenses:'খরচ ম্যানেজমেন্ট', reports:'রিপোর্ট', settings:'সেটিংস' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  const loaders = { dashboard: loadDashboard, orders: loadOrders, products: loadProducts, categories: loadCategories, customers: loadCustomers, coupons: loadCoupons, expenses: loadExpenses, reports: loadReports, settings: loadSettings };
  if (loaders[page]) loaders[page]();

  document.getElementById('sidebar').classList.remove('open');
}

function toast(msg, type) {
  let t = document.querySelector('.admin-toast');
  if (!t) { t = document.createElement('div'); t.className = 'admin-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'admin-toast' + (type === 'error' ? ' error' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

async function api(url, opts) {
  const res = await fetch(url, { headers: {'Content-Type':'application/json'}, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const c = document.getElementById('pageContent');
  c.innerHTML = '<p>লোড হচ্ছে...</p>';
  try {
    const d = await api('/api/admin/dashboard');
    const maxRev = Math.max(...d.last7Days.map(x => x.revenue), 1);

    c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card highlight"><div class="label">আজকের বিক্রি</div><div class="value">৳${d.today.revenue}</div><div class="sub">${d.today.orders}টি অর্ডার</div></div>
      <div class="stat-card highlight"><div class="label">এই মাসের বিক্রি</div><div class="value">৳${d.month.revenue}</div><div class="sub">${d.month.orders}টি অর্ডার</div></div>
      <div class="stat-card"><div class="label">মোট অর্ডার</div><div class="value">${d.totalOrders}</div></div>
      <div class="stat-card"><div class="label">মোট গ্রাহক</div><div class="value">${d.totalCustomers}</div></div>
      <div class="stat-card"><div class="label">মোট পণ্য</div><div class="value">${d.totalProducts}</div></div>
      <div class="stat-card"><div class="label">নেট প্রফিট</div><div class="value" style="color:${d.profit.net>=0?'#16a34a':'#dc2626'}">৳${Math.round(d.profit.net)}</div></div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="label">পেন্ডিং</div><div class="value" style="color:#f59e0b">${d.pendingOrders}</div></div>
      <div class="stat-card"><div class="label">নিশ্চিত</div><div class="value" style="color:#3b82f6">${d.confirmedOrders}</div></div>
      <div class="stat-card"><div class="label">শিপড</div><div class="value" style="color:#0ea5e9">${d.shippedOrders}</div></div>
      <div class="stat-card"><div class="label">ডেলিভারড</div><div class="value" style="color:#22c55e">${d.deliveredOrders}</div></div>
      <div class="stat-card"><div class="label">বাতিল</div><div class="value" style="color:#6b7280">${d.cancelledOrders}</div></div>
      <div class="stat-card"><div class="label">রিটার্ন</div><div class="value" style="color:#dc2626">${d.returnedOrders}</div></div>
    </div>

    <div class="chart-box">
      <h3>গত ৭ দিনের বিক্রি</h3>
      <div class="chart-bars">
        ${d.last7Days.map(day => {
          const h = Math.max((day.revenue / maxRev) * 130, 4);
          return `<div class="chart-bar" style="height:${h}px"><span class="chart-bar-val">৳${day.revenue}</span><span class="chart-bar-label">${day.date.slice(5)}</span></div>`;
        }).join('')}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="table-wrap">
        <div class="table-header"><h2>সাম্প্রতিক অর্ডার</h2></div>
        <table><thead><tr><th>অর্ডার</th><th>গ্রাহক</th><th>মোট</th><th>স্ট্যাটাস</th></tr></thead><tbody>
        ${d.recentOrders.map(o => `<tr style="cursor:pointer" onclick="loadPage('orders');setTimeout(()=>viewOrder(${o.order_number.replace(/[^0-9A-Z]/g,'')}),500)">
          <td>${o.order_number}</td><td>${o.customer_name}</td><td>৳${o.total_amount}</td><td><span class="badge badge-${o.status}">${o.status}</span></td>
        </tr>`).join('')}
        </tbody></table>
      </div>
      <div class="table-wrap">
        <div class="table-header"><h2>লো স্টক সতর্কতা</h2></div>
        <div class="low-stock-list" style="padding:0 16px 16px">
          ${d.lowStockProducts.length === 0 ? '<p style="color:#999;padding:20px 0;text-align:center">সব স্টক ঠিক আছে</p>' :
            d.lowStockProducts.map(p => `<div class="low-stock-item"><span>${p.name_bn || p.name}</span><span class="stock">${p.stock}টি বাকি</span></div>`).join('')}
        </div>
      </div>
    </div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">ডাটা লোড করতে সমস্যা হয়েছে</p>'; }
}

// ===== ORDERS =====
let ordersPage = 1;
let ordersStatus = 'all';
let ordersSearch = '';

async function loadOrders() {
  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <div class="search-bar">
          <input type="text" placeholder="অর্ডার/নাম/ফোন খুঁজুন..." id="orderSearch" onkeyup="if(event.key==='Enter'){ordersSearch=this.value;ordersPage=1;fetchOrders()}">
          <select id="orderStatusFilter" onchange="ordersStatus=this.value;ordersPage=1;fetchOrders()">
            <option value="all">সব স্ট্যাটাস</option>
            <option value="pending">পেন্ডিং</option>
            <option value="confirmed">নিশ্চিত</option>
            <option value="processing">প্রসেসিং</option>
            <option value="shipped">শিপড</option>
            <option value="delivered">ডেলিভারড</option>
            <option value="cancelled">বাতিল</option>
            <option value="returned">রিটার্ন</option>
            <option value="flagged">ফ্ল্যাগড</option>
          </select>
        </div>
      </div>
      <div id="ordersTable"></div>
      <div class="pagination" id="ordersPagination"></div>
    </div>`;
  fetchOrders();
}

async function fetchOrders() {
  try {
    const params = new URLSearchParams({ page: ordersPage, limit: 20, status: ordersStatus, search: ordersSearch });
    const data = await api('/api/admin/orders?' + params);
    const tbody = data.orders.map(o => `<tr>
      <td><strong>${o.order_number}</strong></td>
      <td>${o.customer_name}<br><small style="color:#999">${o.phone}</small></td>
      <td>৳${o.total_amount}</td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td>${o.payment_status === 'paid' ? '<span style="color:#16a34a">পরিশোধিত</span>' : '<span style="color:#f59e0b">অপরিশোধিত</span>'}</td>
      <td>${new Date(o.created_at).toLocaleDateString('bn-BD')}</td>
      <td class="table-actions">
        <button class="btn btn-sm btn-ghost" onclick="viewOrder(${o.id})">বিস্তারিত</button>
      </td>
    </tr>`).join('');

    document.getElementById('ordersTable').innerHTML = `<table><thead><tr><th>অর্ডার</th><th>গ্রাহক</th><th>মোট</th><th>স্ট্যাটাস</th><th>পেমেন্ট</th><th>তারিখ</th><th>অ্যাকশন</th></tr></thead><tbody>${tbody}</tbody></table>`;

    let pagHtml = `<button ${data.page<=1?'disabled':''} onclick="ordersPage--;fetchOrders()">← আগে</button>`;
    pagHtml += `<span>পেজ ${data.page} / ${data.pages || 1}</span>`;
    pagHtml += `<button ${data.page>=data.pages?'disabled':''} onclick="ordersPage++;fetchOrders()">পরে →</button>`;
    document.getElementById('ordersPagination').innerHTML = pagHtml;
  } catch(e) { document.getElementById('ordersTable').innerHTML = '<p style="padding:20px;color:red">লোড ব্যর্থ</p>'; }
}

async function viewOrder(id) {
  try {
    const data = await api('/api/admin/orders/' + id);
    const o = data.order;
    const statuses = ['pending','confirmed','processing','shipped','delivered','returned','cancelled'];
    const statusOpts = statuses.map(s => `<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('');

    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.onclick = function(e) { if(e.target===this) this.remove(); };
    modal.innerHTML = `<div class="admin-modal-content">
      <div class="modal-header"><h2>অর্ডার: ${o.order_number}</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>

      <div class="order-detail-grid">
        <div class="detail-box"><h4>গ্রাহক তথ্য</h4>
          <div class="detail-row"><span>নাম:</span><span>${o.customer_name}</span></div>
          <div class="detail-row"><span>ফোন:</span><span>${o.phone}</span></div>
          <div class="detail-row"><span>ঠিকানা:</span><span>${o.address}</span></div>
          <div class="detail-row"><span>জেলা:</span><span>${o.district || '-'}</span></div>
          ${o.problem_description ? `<div class="detail-row"><span>সমস্যা:</span><span>${o.problem_description}</span></div>` : ''}
        </div>
        <div class="detail-box"><h4>অর্ডার তথ্য</h4>
          <div class="detail-row"><span>সাবটোটাল:</span><span>৳${o.subtotal}</span></div>
          <div class="detail-row"><span>শিপিং:</span><span>৳${o.shipping_cost}</span></div>
          ${o.discount > 0 ? `<div class="detail-row"><span>ডিসকাউন্ট:</span><span>-৳${o.discount}</span></div>` : ''}
          <div class="detail-row"><span>হাদিয়া:</span><span>৳${o.hadiya_amount || 0}</span></div>
          <div class="detail-row" style="font-weight:700"><span>মোট:</span><span>৳${o.total_amount}</span></div>
          <div class="detail-row"><span>পেমেন্ট:</span><span>${o.payment_method} / ${o.payment_status}</span></div>
          <div class="detail-row"><span>তারিখ:</span><span>${new Date(o.created_at).toLocaleString('bn-BD')}</span></div>
        </div>
      </div>

      <div style="margin-top:16px">
        <h4 style="margin-bottom:8px">পণ্যসমূহ</h4>
        <table><thead><tr><th>পণ্য</th><th>পরিমাণ</th><th>দাম</th><th>মোট</th></tr></thead><tbody>
        ${data.items.map(i => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>৳${i.price}</td><td>৳${i.total}</td></tr>`).join('')}
        </tbody></table>
      </div>

      <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div class="form-group"><label>স্ট্যাটাস পরিবর্তন</label><select id="orderStatus">${statusOpts}</select></div>
        <div class="form-group"><label>কুরিয়ার</label><input id="orderCourier" value="${o.courier||''}" placeholder="Steadfast, Pathao..."></div>
        <div class="form-group"><label>ট্র্যাকিং নম্বর</label><input id="orderTracking" value="${o.tracking_number||''}"></div>
      </div>
      <div class="form-group"><label>নোট</label><textarea id="orderNotes" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${o.notes||''}</textarea></div>

      <div style="display:flex;gap:12px;margin-top:16px">
        <button class="btn btn-primary" onclick="updateOrderStatus(${o.id})">সেভ করুন</button>
        <button class="btn btn-danger" onclick="if(confirm('অর্ডার ডিলিট করবেন?')){deleteOrder(${o.id});this.closest('.admin-modal').remove()}">ডিলিট</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { toast('অর্ডার লোড ব্যর্থ', 'error'); }
}

async function updateOrderStatus(id) {
  try {
    const status = document.getElementById('orderStatus').value;
    await api('/api/admin/orders/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
    await api('/api/admin/orders/' + id, { method: 'PUT', body: JSON.stringify({
      courier: document.getElementById('orderCourier').value,
      tracking_number: document.getElementById('orderTracking').value,
      notes: document.getElementById('orderNotes').value
    })});
    document.querySelector('.admin-modal').remove();
    toast('অর্ডার আপডেট হয়েছে');
    fetchOrders();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteOrder(id) {
  try { await api('/api/admin/orders/' + id, { method: 'DELETE' }); toast('অর্ডার ডিলিট হয়েছে'); fetchOrders(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== PRODUCTS =====
let productsPage = 1;

async function loadProducts() {
  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <div class="search-bar">
          <input type="text" placeholder="পণ্য খুঁজুন..." id="prodSearch" onkeyup="if(event.key==='Enter')fetchProducts()">
        </div>
        <button class="btn btn-primary" onclick="showProductForm()">+ নতুন পণ্য</button>
      </div>
      <div id="productsTable"></div>
      <div class="pagination" id="productsPagination"></div>
    </div>`;
  fetchProducts();
}

async function fetchProducts() {
  try {
    const search = document.getElementById('prodSearch')?.value || '';
    const data = await api(`/api/admin/products?page=${productsPage}&search=${search}`);

    document.getElementById('productsTable').innerHTML = `<table><thead><tr><th>ছবি</th><th>পণ্য</th><th>দাম</th><th>স্টক</th><th>ক্যাটেগরি</th><th>স্ট্যাটাস</th><th>অ্যাকশন</th></tr></thead><tbody>
    ${data.products.map(p => `<tr>
      <td>${p.image ? `<img src="${p.image}" style="width:40px;height:40px;border-radius:6px;object-fit:cover">` : '📦'}</td>
      <td><strong>${p.name_bn || p.name}</strong><br><small style="color:#999">SKU: ${p.sku||'-'}</small></td>
      <td>৳${p.sale_price || p.price}${p.sale_price ? `<br><small style="text-decoration:line-through;color:#999">৳${p.price}</small>` : ''}</td>
      <td style="color:${p.stock<=p.low_stock_alert?'#dc2626':'#16a34a'}">${p.stock}</td>
      <td>${p.category_name || '-'}</td>
      <td>${p.is_active ? '<span style="color:#16a34a">সক্রিয়</span>' : '<span style="color:#999">নিষ্ক্রিয়</span>'}</td>
      <td class="table-actions">
        <button class="btn btn-sm btn-ghost" onclick="showProductForm(${p.id})">এডিট</button>
        <button class="btn btn-sm btn-danger" onclick="if(confirm('ডিলিট?'))deleteProduct(${p.id})">✕</button>
      </td>
    </tr>`).join('')}</tbody></table>`;

    let pagHtml = `<button ${data.page<=1?'disabled':''} onclick="productsPage--;fetchProducts()">← আগে</button><span>পেজ ${data.page}/${data.pages||1}</span><button ${data.page>=data.pages?'disabled':''} onclick="productsPage++;fetchProducts()">পরে →</button>`;
    document.getElementById('productsPagination').innerHTML = pagHtml;
  } catch(e) { document.getElementById('productsTable').innerHTML = '<p style="padding:20px;color:red">লোড ব্যর্থ</p>'; }
}

async function showProductForm(id) {
  let product = { name:'', name_bn:'', description:'', description_bn:'', price:'', sale_price:'', cost_price:'', sku:'', category_id:'', stock:0, low_stock_alert:5, image:'', tags:'', is_active:1, is_featured:0 };
  if (id) {
    try {
      const data = await api('/api/admin/products?search=');
      const found = data.products.find(p => p.id === id);
      if (found) product = found;
    } catch(e) {}
  }

  let cats = [];
  try { cats = await api('/api/admin/categories'); } catch(e) {}

  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content">
    <div class="modal-header"><h2>${id ? 'পণ্য এডিট' : 'নতুন পণ্য'}</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveProduct(event, ${id || 'null'})">
      <div class="form-grid">
        <div class="form-group"><label>পণ্যের নাম (English)</label><input id="pName" value="${product.name}" required></div>
        <div class="form-group"><label>পণ্যের নাম (বাংলা)</label><input id="pNameBn" value="${product.name_bn||''}"></div>
        <div class="form-group"><label>দাম (৳)</label><input type="number" id="pPrice" value="${product.price}" required></div>
        <div class="form-group"><label>সেল দাম</label><input type="number" id="pSalePrice" value="${product.sale_price||''}"></div>
        <div class="form-group"><label>কস্ট দাম</label><input type="number" id="pCostPrice" value="${product.cost_price||''}"></div>
        <div class="form-group"><label>SKU</label><input id="pSku" value="${product.sku||''}"></div>
        <div class="form-group"><label>স্টক</label><input type="number" id="pStock" value="${product.stock}"></div>
        <div class="form-group"><label>লো স্টক সতর্কতা</label><input type="number" id="pLowStock" value="${product.low_stock_alert}"></div>
        <div class="form-group"><label>ক্যাটেগরি</label><select id="pCategory"><option value="">নির্বাচন করুন</option>${cats.map(c=>`<option value="${c.id}" ${c.id==product.category_id?'selected':''}>${c.name_bn||c.name}</option>`).join('')}</select></div>
        <div class="form-group"><label>ট্যাগ</label><input id="pTags" value="${product.tags||''}"></div>
      </div>
      <div class="form-group"><label>বিবরণ (English)</label><textarea id="pDesc" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${product.description||''}</textarea></div>
      <div class="form-group"><label>বিবরণ (বাংলা)</label><textarea id="pDescBn" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${product.description_bn||''}</textarea></div>
      <div class="form-group"><label>ছবি আপলোড</label><input type="file" id="pImage" accept="image/*" onchange="uploadImage(this)"><input type="hidden" id="pImageUrl" value="${product.image||''}">
        ${product.image ? `<img src="${product.image}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;margin-top:8px" id="pImagePreview">` : '<div id="pImagePreview"></div>'}
      </div>
      <div style="display:flex;gap:16px;margin-bottom:16px">
        <label><input type="checkbox" id="pActive" ${product.is_active?'checked':''}> সক্রিয়</label>
        <label><input type="checkbox" id="pFeatured" ${product.is_featured?'checked':''}> ফিচার্ড</label>
      </div>
      <button type="submit" class="btn btn-primary">${id ? 'আপডেট করুন' : 'পণ্য যোগ করুন'}</button>
    </form>
  </div>`;
  document.body.appendChild(modal);
}

async function uploadImage(input) {
  if (!input.files[0]) return;
  const form = new FormData();
  form.append('image', input.files[0]);
  try {
    const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
    const data = await res.json();
    document.getElementById('pImageUrl').value = data.url;
    document.getElementById('pImagePreview').innerHTML = `<img src="${data.url}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;margin-top:8px">`;
  } catch(e) { toast('আপলোড ব্যর্থ', 'error'); }
}

async function saveProduct(e, id) {
  e.preventDefault();
  const body = {
    name: document.getElementById('pName').value,
    name_bn: document.getElementById('pNameBn').value,
    description: document.getElementById('pDesc').value,
    description_bn: document.getElementById('pDescBn').value,
    price: Number(document.getElementById('pPrice').value),
    sale_price: document.getElementById('pSalePrice').value ? Number(document.getElementById('pSalePrice').value) : null,
    cost_price: document.getElementById('pCostPrice').value ? Number(document.getElementById('pCostPrice').value) : null,
    sku: document.getElementById('pSku').value || null,
    category_id: document.getElementById('pCategory').value ? Number(document.getElementById('pCategory').value) : null,
    stock: Number(document.getElementById('pStock').value),
    low_stock_alert: Number(document.getElementById('pLowStock').value),
    image: document.getElementById('pImageUrl').value,
    tags: document.getElementById('pTags').value,
    is_active: document.getElementById('pActive').checked ? 1 : 0,
    is_featured: document.getElementById('pFeatured').checked ? 1 : 0
  };
  try {
    if (id) { await api('/api/admin/products/' + id, { method: 'PUT', body: JSON.stringify(body) }); }
    else { await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body) }); }
    document.querySelector('.admin-modal').remove();
    toast(id ? 'পণ্য আপডেট হয়েছে' : 'পণ্য যোগ হয়েছে');
    fetchProducts();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteProduct(id) {
  try { await api('/api/admin/products/' + id, { method: 'DELETE' }); toast('ডিলিট হয়েছে'); fetchProducts(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== CATEGORIES =====
async function loadCategories() {
  const c = document.getElementById('pageContent');
  try {
    const cats = await api('/api/admin/categories');
    c.innerHTML = `<div class="table-wrap">
      <div class="table-header"><h2>ক্যাটেগরি</h2><button class="btn btn-primary" onclick="showCategoryForm()">+ নতুন ক্যাটেগরি</button></div>
      <table><thead><tr><th>নাম</th><th>নাম (বাংলা)</th><th>Slug</th><th>সক্রিয়</th><th>অ্যাকশন</th></tr></thead><tbody>
      ${cats.map(c => `<tr><td>${c.name}</td><td>${c.name_bn||'-'}</td><td>${c.slug}</td><td>${c.is_active?'হ্যাঁ':'না'}</td>
        <td class="table-actions"><button class="btn btn-sm btn-danger" onclick="if(confirm('ডিলিট?'))deleteCategory(${c.id})">✕</button></td></tr>`).join('')}
      </tbody></table></div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">লোড ব্যর্থ</p>'; }
}

function showCategoryForm() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:400px">
    <div class="modal-header"><h2>নতুন ক্যাটেগরি</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveCategory(event)">
      <div class="form-group"><label>নাম (English)</label><input id="catName" required></div>
      <div class="form-group"><label>নাম (বাংলা)</label><input id="catNameBn"></div>
      <button type="submit" class="btn btn-primary">যোগ করুন</button>
    </form></div>`;
  document.body.appendChild(modal);
}

async function saveCategory(e) {
  e.preventDefault();
  try {
    await api('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name: document.getElementById('catName').value, name_bn: document.getElementById('catNameBn').value }) });
    document.querySelector('.admin-modal').remove();
    toast('ক্যাটেগরি যোগ হয়েছে');
    loadCategories();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteCategory(id) {
  try { await api('/api/admin/categories/' + id, { method: 'DELETE' }); toast('ডিলিট হয়েছে'); loadCategories(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== CUSTOMERS =====
let customersPage = 1;

async function loadCustomers() {
  const c = document.getElementById('pageContent');
  c.innerHTML = `<div class="table-wrap">
    <div class="table-header"><div class="search-bar"><input type="text" placeholder="গ্রাহক খুঁজুন..." id="custSearch" onkeyup="if(event.key==='Enter')fetchCustomers()"></div></div>
    <div id="customersTable"></div>
    <div class="pagination" id="customersPagination"></div>
  </div>`;
  fetchCustomers();
}

async function fetchCustomers() {
  try {
    const search = document.getElementById('custSearch')?.value || '';
    const data = await api(`/api/admin/customers?page=${customersPage}&search=${search}`);
    document.getElementById('customersTable').innerHTML = `<table><thead><tr><th>নাম</th><th>ফোন</th><th>ঠিকানা</th><th>অর্ডার</th><th>মোট খরচ</th><th>ফ্রড স্কোর</th><th>অ্যাকশন</th></tr></thead><tbody>
    ${data.customers.map(c => `<tr>
      <td><strong>${c.name}</strong>${c.is_blocked?'<span style="color:red;font-size:11px"> (ব্লক)</span>':''}</td>
      <td>${c.phone}</td><td>${c.address||'-'}</td><td>${c.total_orders}</td><td>৳${c.total_spent}</td>
      <td style="color:${c.fraud_score>50?'#dc2626':c.fraud_score>20?'#f59e0b':'#16a34a'}">${c.fraud_score}</td>
      <td class="table-actions"><button class="btn btn-sm btn-ghost" onclick="viewCustomer(${c.id})">বিস্তারিত</button></td>
    </tr>`).join('')}</tbody></table>`;
  } catch(e) {}
}

async function viewCustomer(id) {
  try {
    const data = await api('/api/admin/customers/' + id);
    const c = data.customer;
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.onclick = function(e) { if(e.target===this) this.remove(); };
    modal.innerHTML = `<div class="admin-modal-content">
      <div class="modal-header"><h2>${c.name}</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
      <div class="order-detail-grid">
        <div class="detail-box"><h4>তথ্য</h4>
          <div class="detail-row"><span>ফোন:</span><span>${c.phone}</span></div>
          <div class="detail-row"><span>ঠিকানা:</span><span>${c.address||'-'}</span></div>
          <div class="detail-row"><span>মোট অর্ডার:</span><span>${c.total_orders}</span></div>
          <div class="detail-row"><span>মোট খরচ:</span><span>৳${c.total_spent}</span></div>
          <div class="detail-row"><span>ফ্রড স্কোর:</span><span>${c.fraud_score}</span></div>
        </div>
        <div class="detail-box"><h4>অ্যাকশন</h4>
          <div class="form-group"><label>নোট</label><textarea id="custNotes" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-family:inherit">${c.notes||''}</textarea></div>
          <label><input type="checkbox" id="custBlocked" ${c.is_blocked?'checked':''}> ব্লক করুন</label>
          <button class="btn btn-primary" style="margin-top:12px" onclick="updateCustomer(${c.id})">সেভ</button>
        </div>
      </div>
      <h4 style="margin:16px 0 8px">অর্ডার ইতিহাস</h4>
      <table><thead><tr><th>অর্ডার</th><th>মোট</th><th>স্ট্যাটাস</th><th>তারিখ</th></tr></thead><tbody>
      ${data.orders.map(o => `<tr><td>${o.order_number}</td><td>৳${o.total_amount}</td><td><span class="badge badge-${o.status}">${o.status}</span></td><td>${new Date(o.created_at).toLocaleDateString('bn-BD')}</td></tr>`).join('')}
      </tbody></table>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { toast('লোড ব্যর্থ', 'error'); }
}

async function updateCustomer(id) {
  try {
    await api('/api/admin/customers/' + id, { method: 'PUT', body: JSON.stringify({ notes: document.getElementById('custNotes').value, is_blocked: document.getElementById('custBlocked').checked ? 1 : 0 }) });
    document.querySelector('.admin-modal').remove();
    toast('আপডেট হয়েছে');
    fetchCustomers();
  } catch(e) { toast(e.message, 'error'); }
}

// ===== COUPONS =====
async function loadCoupons() {
  const c = document.getElementById('pageContent');
  try {
    const coupons = await api('/api/admin/coupons');
    c.innerHTML = `<div class="table-wrap">
      <div class="table-header"><h2>কুপন</h2><button class="btn btn-primary" onclick="showCouponForm()">+ নতুন কুপন</button></div>
      <table><thead><tr><th>কোড</th><th>ধরন</th><th>মান</th><th>ন্যূনতম</th><th>ব্যবহার</th><th>মেয়াদ</th><th>অ্যাকশন</th></tr></thead><tbody>
      ${coupons.map(cp => `<tr>
        <td><strong>${cp.code}</strong></td><td>${cp.type==='percent'?'শতাংশ':'নির্দিষ্ট'}</td>
        <td>${cp.type==='percent'?cp.value+'%':'৳'+cp.value}</td><td>৳${cp.min_order}</td>
        <td>${cp.used_count}${cp.max_uses?'/'+cp.max_uses:''}</td><td>${cp.expires_at||'কোনো সীমা নেই'}</td>
        <td><button class="btn btn-sm btn-danger" onclick="if(confirm('ডিলিট?'))deleteCoupon(${cp.id})">✕</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">লোড ব্যর্থ</p>'; }
}

function showCouponForm() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:450px">
    <div class="modal-header"><h2>নতুন কুপন</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveCoupon(event)">
      <div class="form-group"><label>কুপন কোড</label><input id="cpCode" required placeholder="SAVE20"></div>
      <div class="form-grid">
        <div class="form-group"><label>ধরন</label><select id="cpType"><option value="fixed">নির্দিষ্ট (৳)</option><option value="percent">শতাংশ (%)</option></select></div>
        <div class="form-group"><label>মান</label><input type="number" id="cpValue" required></div>
        <div class="form-group"><label>ন্যূনতম অর্ডার</label><input type="number" id="cpMin" value="0"></div>
        <div class="form-group"><label>সর্বোচ্চ ব্যবহার</label><input type="number" id="cpMax" placeholder="সীমাহীন"></div>
      </div>
      <div class="form-group"><label>মেয়াদ শেষ</label><input type="date" id="cpExpires"></div>
      <button type="submit" class="btn btn-primary">কুপন তৈরি করুন</button>
    </form></div>`;
  document.body.appendChild(modal);
}

async function saveCoupon(e) {
  e.preventDefault();
  try {
    await api('/api/admin/coupons', { method: 'POST', body: JSON.stringify({
      code: document.getElementById('cpCode').value,
      type: document.getElementById('cpType').value,
      value: Number(document.getElementById('cpValue').value),
      min_order: Number(document.getElementById('cpMin').value),
      max_uses: document.getElementById('cpMax').value ? Number(document.getElementById('cpMax').value) : null,
      expires_at: document.getElementById('cpExpires').value || null
    })});
    document.querySelector('.admin-modal').remove();
    toast('কুপন তৈরি হয়েছে');
    loadCoupons();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteCoupon(id) {
  try { await api('/api/admin/coupons/' + id, { method: 'DELETE' }); toast('ডিলিট হয়েছে'); loadCoupons(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== EXPENSES =====
async function loadExpenses() {
  const c = document.getElementById('pageContent');
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    const data = await api('/api/admin/expenses?month=' + currentMonth);
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div><strong>মোট খরচ (${currentMonth}):</strong> ৳${data.total}</div>
      <div style="display:flex;gap:8px">
        <input type="month" id="expMonth" value="${currentMonth}" onchange="reloadExpenses()">
        <button class="btn btn-primary" onclick="showExpenseForm()">+ খরচ যোগ করুন</button>
      </div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>তারিখ</th><th>ক্যাটেগরি</th><th>পরিমাণ</th><th>বিবরণ</th><th>অ্যাকশন</th></tr></thead><tbody>
    ${data.expenses.map(e => `<tr><td>${e.date}</td><td>${e.category}</td><td>৳${e.amount}</td><td>${e.description||'-'}</td>
      <td><button class="btn btn-sm btn-danger" onclick="if(confirm('ডিলিট?'))deleteExpense(${e.id})">✕</button></td></tr>`).join('')}
    </tbody></table></div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">লোড ব্যর্থ</p>'; }
}

async function reloadExpenses() {
  const month = document.getElementById('expMonth').value;
  try {
    const data = await api('/api/admin/expenses?month=' + month);
    loadExpenses();
  } catch(e) {}
}

function showExpenseForm() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:400px">
    <div class="modal-header"><h2>খরচ যোগ</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveExpense(event)">
      <div class="form-group"><label>ক্যাটেগরি</label><select id="expCat"><option>কুরিয়ার</option><option>বিজ্ঞাপন</option><option>পণ্য কেনা</option><option>অফিস</option><option>বেতন</option><option>অন্যান্য</option></select></div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="expAmount" required></div>
      <div class="form-group"><label>বিবরণ</label><input id="expDesc"></div>
      <div class="form-group"><label>তারিখ</label><input type="date" id="expDate" value="${new Date().toISOString().split('T')[0]}"></div>
      <button type="submit" class="btn btn-primary">সেভ করুন</button>
    </form></div>`;
  document.body.appendChild(modal);
}

async function saveExpense(e) {
  e.preventDefault();
  try {
    await api('/api/admin/expenses', { method: 'POST', body: JSON.stringify({
      category: document.getElementById('expCat').value,
      amount: Number(document.getElementById('expAmount').value),
      description: document.getElementById('expDesc').value,
      date: document.getElementById('expDate').value
    })});
    document.querySelector('.admin-modal').remove();
    toast('খরচ যোগ হয়েছে');
    loadExpenses();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteExpense(id) {
  try { await api('/api/admin/expenses/' + id, { method: 'DELETE' }); toast('ডিলিট হয়েছে'); loadExpenses(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== REPORTS =====
async function loadReports() {
  const c = document.getElementById('pageContent');
  try {
    const sales = await api('/api/admin/reports/sales?group_by=day');
    const topProducts = await api('/api/admin/reports/products');

    const maxRev = Math.max(...sales.slice(0, 14).map(s => s.revenue), 1);

    c.innerHTML = `
    <div class="chart-box">
      <h3>দৈনিক বিক্রি (সাম্প্রতিক)</h3>
      <div class="chart-bars">
        ${sales.slice(0, 14).reverse().map(day => {
          const h = Math.max((day.revenue / maxRev) * 130, 4);
          return `<div class="chart-bar" style="height:${h}px"><span class="chart-bar-val">৳${day.revenue}</span><span class="chart-bar-label">${day.period.slice(5)}</span></div>`;
        }).join('')}
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-header"><h2>টপ পণ্য</h2></div>
      <table><thead><tr><th>পণ্য</th><th>মোট বিক্রি</th><th>মোট আয়</th></tr></thead><tbody>
      ${topProducts.map(p => `<tr><td>${p.product_name}</td><td>${p.total_sold}টি</td><td>৳${p.total_revenue}</td></tr>`).join('')}
      </tbody></table>
    </div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">লোড ব্যর্থ</p>'; }
}

// ===== SETTINGS =====
async function loadSettings() {
  const c = document.getElementById('pageContent');
  try {
    const s = await api('/api/admin/settings');
    c.innerHTML = `<form onsubmit="saveSettings(event)">
      <div class="settings-section">
        <h3>শপ তথ্য</h3>
        <div class="form-grid">
          <div class="form-group"><label>শপের নাম (বাংলা)</label><input id="sShopName" value="${s.shop_name||''}"></div>
          <div class="form-group"><label>শপের নাম (English)</label><input id="sShopNameEn" value="${s.shop_name_en||''}"></div>
          <div class="form-group"><label>ফোন</label><input id="sPhone" value="${s.shop_phone||''}"></div>
          <div class="form-group"><label>ইমেইল</label><input id="sEmail" value="${s.shop_email||''}"></div>
        </div>
        <div class="form-group"><label>ঠিকানা</label><input id="sAddress" value="${s.shop_address||''}"></div>
      </div>

      <div class="settings-section">
        <h3>ডেলিভারি চার্জ</h3>
        <div class="form-grid">
          <div class="form-group"><label>ঢাকার ভিতরে (৳)</label><input type="number" id="sShipIn" value="${s.shipping_inside_dhaka||60}"></div>
          <div class="form-group"><label>ঢাকার বাইরে (৳)</label><input type="number" id="sShipOut" value="${s.shipping_outside_dhaka||120}"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>পেমেন্ট</h3>
        <div class="form-grid">
          <div class="form-group"><label><input type="checkbox" id="sCod" ${s.cod_enabled==='1'?'checked':''}> ক্যাশ অন ডেলিভারি</label></div>
          <div></div>
          <div class="form-group"><label><input type="checkbox" id="sBkash" ${s.bkash_enabled==='1'?'checked':''}> bKash</label><input id="sBkashNum" value="${s.bkash_number||''}" placeholder="bKash নম্বর" style="margin-top:6px"></div>
          <div class="form-group"><label><input type="checkbox" id="sNagad" ${s.nagad_enabled==='1'?'checked':''}> Nagad</label><input id="sNagadNum" value="${s.nagad_number||''}" placeholder="Nagad নম্বর" style="margin-top:6px"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>সোশ্যাল ও মার্কেটিং</h3>
        <div class="form-grid">
          <div class="form-group"><label>WhatsApp নম্বর</label><input id="sWhatsapp" value="${s.whatsapp_number||''}"></div>
          <div class="form-group"><label>Messenger লিংক</label><input id="sMessenger" value="${s.messenger_link||''}"></div>
          <div class="form-group"><label>Facebook Page</label><input id="sFbPage" value="${s.facebook_page||''}"></div>
          <div class="form-group"><label>Facebook Pixel ID</label><input id="sFbPixel" value="${s.facebook_pixel||''}"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>পাসওয়ার্ড পরিবর্তন</h3>
        <div class="form-grid">
          <div class="form-group"><label>বর্তমান পাসওয়ার্ড</label><input type="password" id="sCurPass"></div>
          <div class="form-group"><label>নতুন পাসওয়ার্ড</label><input type="password" id="sNewPass"></div>
        </div>
        <button type="button" class="btn btn-ghost" onclick="changePassword()">পাসওয়ার্ড পরিবর্তন</button>
      </div>

      <button type="submit" class="btn btn-primary" style="margin-top:8px">সেটিংস সেভ করুন</button>
    </form>`;
  } catch(e) { c.innerHTML = '<p style="color:red">লোড ব্যর্থ</p>'; }
}

async function saveSettings(e) {
  e.preventDefault();
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
      shop_name: document.getElementById('sShopName').value,
      shop_name_en: document.getElementById('sShopNameEn').value,
      shop_phone: document.getElementById('sPhone').value,
      shop_email: document.getElementById('sEmail').value,
      shop_address: document.getElementById('sAddress').value,
      shipping_inside_dhaka: document.getElementById('sShipIn').value,
      shipping_outside_dhaka: document.getElementById('sShipOut').value,
      cod_enabled: document.getElementById('sCod').checked ? '1' : '0',
      bkash_enabled: document.getElementById('sBkash').checked ? '1' : '0',
      bkash_number: document.getElementById('sBkashNum').value,
      nagad_enabled: document.getElementById('sNagad').checked ? '1' : '0',
      nagad_number: document.getElementById('sNagadNum').value,
      whatsapp_number: document.getElementById('sWhatsapp').value,
      messenger_link: document.getElementById('sMessenger').value,
      facebook_page: document.getElementById('sFbPage').value,
      facebook_pixel: document.getElementById('sFbPixel').value,
    })});
    toast('সেটিংস সেভ হয়েছে');
  } catch(e) { toast(e.message, 'error'); }
}

async function changePassword() {
  const cur = document.getElementById('sCurPass').value;
  const nw = document.getElementById('sNewPass').value;
  if (!cur || !nw) { toast('দুটি ফিল্ডই পূরণ করুন', 'error'); return; }
  try {
    await api('/api/admin/password', { method: 'PUT', body: JSON.stringify({ current_password: cur, new_password: nw }) });
    toast('পাসওয়ার্ড পরিবর্তন হয়েছে');
    document.getElementById('sCurPass').value = '';
    document.getElementById('sNewPass').value = '';
  } catch(e) { toast(e.message, 'error'); }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadDashboard();
});
