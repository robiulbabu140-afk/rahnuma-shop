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

  const titles = { dashboard:'Dashboard', orders:'Order Management', products:'Product Management', categories:'Categories', customers:'Customer Management', coupons:'Coupon Management', expenses:'Expense Management', reports:'Reports', ads:'Ad Performance', pages:'Landing Pages', fraud:'Fraud Protection', settings:'Settings' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  const loaders = { dashboard: loadDashboard, orders: loadOrders, products: loadProducts, categories: loadCategories, customers: loadCustomers, coupons: loadCoupons, expenses: loadExpenses, inventory: loadInventory, reports: loadReports, ads: loadAdsPage, pages: loadPages, fraud: loadFraudPage, settings: loadSettings };
  if (loaders[page]) loaders[page]();

  document.getElementById('sidebar').classList.remove('open');
  const ov = document.getElementById('sidebarOverlay');
  if (ov) ov.classList.remove('show');
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
  const fetchOpts = { credentials: 'same-origin', ...opts };
  if (opts && opts.body) {
    fetchOpts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  }
  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('Server error: ' + text.substring(0, 100)); }
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const c = document.getElementById('pageContent');
  c.innerHTML = '<p>Loading dashboard...</p>';
  try {
    const d = await api('/api/admin/dashboard');
    if (!d) { c.innerHTML = '<p style="color:red">No data received</p>'; return; }
    const maxRev = Math.max(...d.last7Days.map(x => x.revenue), 1);

    c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card highlight"><div class="label">Today's Sales</div><div class="value">TK ${d.today.revenue}</div><div class="sub">${d.today.orders} orders</div></div>
      <div class="stat-card highlight"><div class="label">This Month's Sales</div><div class="value">TK ${d.month.revenue}</div><div class="sub">${d.month.orders} orders</div></div>
      <div class="stat-card"><div class="label">Total Orders</div><div class="value">${d.totalOrders}</div></div>
      <div class="stat-card"><div class="label">Total Customers</div><div class="value">${d.totalCustomers}</div></div>
      <div class="stat-card"><div class="label">Total Products</div><div class="value">${d.totalProducts}</div></div>
      <div class="stat-card"><div class="label">Net Profit</div><div class="value" style="color:${d.profit.net>=0?'#16a34a':'#dc2626'}">TK ${Math.round(d.profit.net)}</div></div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="label">Pending</div><div class="value" style="color:#f59e0b">${d.pendingOrders}</div></div>
      <div class="stat-card"><div class="label">Confirmed</div><div class="value" style="color:#3b82f6">${d.confirmedOrders}</div></div>
      <div class="stat-card"><div class="label">Shipped</div><div class="value" style="color:#0ea5e9">${d.shippedOrders}</div></div>
      <div class="stat-card"><div class="label">Delivered</div><div class="value" style="color:#22c55e">${d.deliveredOrders}</div></div>
      <div class="stat-card"><div class="label">Cancelled</div><div class="value" style="color:#6b7280">${d.cancelledOrders}</div></div>
      <div class="stat-card"><div class="label">Returned</div><div class="value" style="color:#dc2626">${d.returnedOrders}</div></div>
    </div>

    <div class="chart-box">
      <h3>Last 7 Days Sales</h3>
      <div class="chart-bars">
        ${d.last7Days.map(day => {
          const h = Math.max((day.revenue / maxRev) * 130, 4);
          return `<div class="chart-bar" style="height:${h}px"><span class="chart-bar-val">TK ${day.revenue}</span><span class="chart-bar-label">${day.date.slice(5)}</span></div>`;
        }).join('')}
      </div>
    </div>

    <div class="dash-grid-2">
      <div class="table-wrap">
        <div class="table-header"><h2>Recent Orders</h2></div>
        <div class="table-responsive"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>
        ${d.recentOrders.map(o => `<tr style="cursor:pointer" onclick="loadPage('orders');setTimeout(()=>viewOrder(${o.order_number.replace(/[^0-9A-Z]/g,'')}),500)">
          <td>${o.order_number}</td><td>${o.customer_name}</td><td>TK ${o.total_amount}</td><td><span class="badge badge-${o.status}">${o.status}</span></td>
        </tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="table-wrap">
        <div class="table-header"><h2>Low Stock Alert</h2></div>
        <div class="low-stock-list">
          ${d.lowStockProducts.length === 0 ? '<p style="color:#999;padding:20px 0;text-align:center">All stock is fine</p>' :
            d.lowStockProducts.map(p => `<div class="low-stock-item"><span>${p.name_bn || p.name}</span><span class="stock">${p.stock} remaining</span></div>`).join('')}
        </div>
      </div>
    </div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">Failed to load dashboard: ' + e.message + '</p>'; console.error('Dashboard error:', e); }
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
          <input type="text" placeholder="Search order/name/phone..." id="orderSearch" onkeyup="if(event.key==='Enter'){ordersSearch=this.value;ordersPage=1;fetchOrders()}">
          <select id="orderStatusFilter" onchange="ordersStatus=this.value;ordersPage=1;fetchOrders()">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="returned">Returned</option>
            <option value="flagged">Flagged</option>
          </select>
        </div>
      </div>
      <div id="ordersTable"></div>
      <div class="pagination" id="ordersPagination"></div>
    </div>`;
  fetchOrders();
}

let _courierStats = null;

async function fetchOrders() {
  try {
    const data = await api('/api/admin/orders?' + new URLSearchParams({ page: ordersPage, limit: 20, status: ordersStatus, search: ordersSearch }));

    const tbody = data.orders.map(o => `<tr>
      <td><strong>${o.order_number}</strong></td>
      <td>${o.customer_name}<br><small style="color:#999">${o.phone}</small></td>
      <td>TK ${o.total_amount}</td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td>${o.payment_status === 'paid' ? '<span style="color:#16a34a">Paid</span>' : '<span style="color:#f59e0b">Unpaid</span>'}</td>
      <td>${new Date(o.created_at).toLocaleDateString('en-US')}</td>
      <td>${o.courier ? `<span style="font-size:11px">${o.courier}</span>${o.tracking_code ? `<br><code style="font-size:10px">${o.tracking_code}</code>` : ''}` : '<span style="color:#999;font-size:11px">—</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-ghost" style="padding:3px 10px;font-size:11px;color:#1a4a2e;border-color:#1a4a2e" onclick="checkCustomerBdCourier('${o.phone}','${(o.customer_name||'').replace(/'/g,' ')}')">🔍 Check</button>
      </td>
      <td class="table-actions">
        <button class="btn btn-sm btn-ghost" onclick="viewOrder(${o.id})">Details</button>
        ${!o.consignment_id && (o.status==='confirmed'||o.status==='processing') ? `<button class="btn btn-sm btn-gold" onclick="sendToCourier(${o.id})">🚀</button>` : ''}
      </td>
    </tr>`).join('');

    document.getElementById('ordersTable').innerHTML = `<div class="table-responsive"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Payment</th><th>Date</th><th>Courier</th><th>Customer Check</th><th>Action</th></tr></thead><tbody>${tbody}</tbody></table></div>`;

    let pagHtml = `<button ${data.page<=1?'disabled':''} onclick="ordersPage--;fetchOrders()">← Prev</button>`;
    pagHtml += `<span>Page ${data.page} / ${data.pages || 1}</span>`;
    pagHtml += `<button ${data.page>=data.pages?'disabled':''} onclick="ordersPage++;fetchOrders()">Next →</button>`;
    document.getElementById('ordersPagination').innerHTML = pagHtml;
  } catch(e) { document.getElementById('ordersTable').innerHTML = '<p style="padding:20px;color:red">Load failed</p>'; }
}

function _renderCourierStatsModal(modal, stats) {
  const now = new Date().toLocaleString('en-US', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  const rateColor = parseFloat(stats.overall.rate) >= 70 ? '#16a34a' : '#dc2626';
  modal.querySelector('.admin-modal-content').innerHTML = `
    <div class="modal-header">
      <h2>Courier Success Rate</h2>
      <button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button>
    </div>
    <div style="text-align:center;padding:20px 0 12px">
      <div style="font-size:42px;font-weight:800;color:${rateColor}">${stats.overall.rate}%</div>
      <div style="font-size:13px;color:#6b7280;margin-top:6px">
        ${stats.overall.total} total &bull; <span style="color:#16a34a">${stats.overall.success} success</span> &bull; <span style="color:#dc2626">${stats.overall.cancel} cancel</span>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
      <thead>
        <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb">
          <th style="padding:10px 12px;text-align:left">Courier</th>
          <th style="padding:10px 12px;text-align:center">Total</th>
          <th style="padding:10px 12px;text-align:center">Success</th>
          <th style="padding:10px 12px;text-align:center">Cancel</th>
          <th style="padding:10px 12px;text-align:center">Rate</th>
        </tr>
      </thead>
      <tbody>
        ${stats.couriers.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:#999">No courier data yet</td></tr>` :
          stats.couriers.map(c => {
            const cr = parseFloat(c.rate);
            const color = cr >= 70 ? '#16a34a' : cr >= 40 ? '#f59e0b' : '#dc2626';
            return `<tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 12px;font-weight:600">${c.courier}</td>
              <td style="padding:10px 12px;text-align:center">${c.total}</td>
              <td style="padding:10px 12px;text-align:center;color:#16a34a;font-weight:600">${c.success}</td>
              <td style="padding:10px 12px;text-align:center;color:#dc2626;font-weight:600">${c.cancel}</td>
              <td style="padding:10px 12px;text-align:center;font-weight:700;color:${color}">${c.rate}%</td>
            </tr>`;
          }).join('')}
      </tbody>
    </table>
    <div style="text-align:right;font-size:11px;color:#9ca3af;margin-top:12px;padding-top:8px;border-top:1px solid #f3f4f6">
      Checked: ${now}
    </div>`;
}

async function showCourierStats() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:460px">
    <div class="modal-header">
      <h2>Courier Success Rate</h2>
      <button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button>
    </div>
    <div style="padding:30px;text-align:center">
      <div style="width:36px;height:36px;border:4px solid #e2e8f0;border-top-color:#0f766e;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto"></div>
      <p style="color:#94a3b8;margin-top:12px;font-size:13px">Courier API থেকে data আনছে...</p>
    </div>
  </div>`;
  if (!document.querySelector('#bdSpinStyle')) {
    const st = document.createElement('style'); st.id = 'bdSpinStyle';
    st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  document.body.appendChild(modal);
  try {
    const stats = await api('/api/admin/courier/live-stats');
    _courierStats = stats;
    _renderCourierStatsModal(modal, stats);
  } catch(e) {
    modal.querySelector('.admin-modal-content').innerHTML = `
      <div class="modal-header"><h2>Courier Success Rate</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
      <div style="padding:30px;text-align:center"><p style="color:#ef4444">${e.message}</p></div>`;
  }
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
      <div class="modal-header"><h2>Order: ${o.order_number}</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>

      <div class="order-detail-grid">
        <div class="detail-box"><h4>Customer Info</h4>
          <div class="detail-row"><span>Name:</span><span>${o.customer_name}</span></div>
          <div class="detail-row"><span>Phone:</span><span>${o.phone} <button class="btn btn-sm" style="margin-left:8px;background:#1a4a2e;color:#fff;padding:2px 10px;font-size:12px" onclick="checkCustomerBdCourier('${o.phone}','${o.customer_name}')">🔍 Customer Check</button></span></div>
          <div class="detail-row"><span>Address:</span><span>${o.address}</span></div>
          <div class="detail-row"><span>District:</span><span>${o.district || '-'}</span></div>
          ${o.problem_description ? `<div class="detail-row"><span>Issue:</span><span>${o.problem_description}</span></div>` : ''}
        </div>
        <div class="detail-box"><h4>Order Info</h4>
          <div class="detail-row"><span>Subtotal:</span><span>TK ${o.subtotal}</span></div>
          <div class="detail-row"><span>Shipping:</span><span>TK ${o.shipping_cost}</span></div>
          ${o.discount > 0 ? `<div class="detail-row"><span>Discount:</span><span>-TK ${o.discount}</span></div>` : ''}
          <div class="detail-row"><span>Hadiya:</span><span>TK ${o.hadiya_amount || 0}</span></div>
          <div class="detail-row" style="font-weight:700"><span>Total:</span><span>TK ${o.total_amount}</span></div>
          <div class="detail-row"><span>Payment:</span><span>${o.payment_method} / ${o.payment_status}</span></div>
          <div class="detail-row"><span>Date:</span><span>${new Date(o.created_at).toLocaleString('en-US')}</span></div>
        </div>
      </div>

      <div style="margin-top:16px">
        <h4 style="margin-bottom:8px">Products</h4>
        <table><thead><tr><th>Product</th><th>Quantity</th><th>Price</th><th>Total</th></tr></thead><tbody>
        ${data.items.map(i => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>TK ${i.price}</td><td>TK ${i.total}</td></tr>`).join('')}
        </tbody></table>
      </div>

      ${o.consignment_id ? `<div class="detail-box" style="margin-top:16px;background:#ecfeff;border-color:#0ea5e9">
        <h4 style="color:#0e7490">Courier Info (${o.courier||'Courier'})</h4>
        <div class="detail-row"><span>Consignment ID:</span><span>${o.consignment_id}</span></div>
        <div class="detail-row"><span>Tracking Code:</span><span><strong>${o.tracking_code}</strong></span></div>
        <div class="detail-row"><span>Courier Status:</span><span><span class="badge badge-${o.courier_status==='delivered'?'delivered':o.courier_status==='cancelled'?'cancelled':'shipped'}">${o.courier_status||'-'}</span></span></div>
        ${o.delivery_charge ? `<div class="detail-row"><span>Delivery Charge:</span><span>TK ${o.delivery_charge}</span></div>` : ''}
        ${o.courier_message ? `<div class="detail-row"><span>Tracking:</span><span>${o.courier_message}</span></div>` : ''}
        <button class="btn btn-sm btn-ghost" style="margin-top:8px" onclick="refreshCourierStatus(${o.id})">Refresh Status</button>
      </div>` : `<div style="margin-top:16px;padding:16px;background:#fff7ed;border:1.5px solid #f59e0b;border-radius:10px">
        <p style="margin-bottom:12px;font-size:14px;color:#92400e;text-align:center">এই অর্ডারটি এখনো কোনো কুরিয়ারে পাঠানো হয়নি</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-gold" onclick="sendToCourier(${o.id})">🚚 Steadfast</button>
          <button class="btn btn-primary" onclick="sendToPathao(${o.id})">🛵 Pathao</button>
          <button class="btn" style="background:#e53e3e;color:#fff" onclick="sendToRedx(${o.id})">📦 RedX</button>
        </div>
      </div>`}

      <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div class="form-group"><label>Change Status</label><select id="orderStatus">${statusOpts}</select></div>
        <div class="form-group"><label>Courier</label><input id="orderCourier" value="${o.courier||''}" placeholder="Steadfast, Pathao..."></div>
        <div class="form-group"><label>Tracking Number</label><input id="orderTracking" value="${o.tracking_number||o.tracking_code||''}"></div>
      </div>
      <div class="form-group"><label>Notes</label><textarea id="orderNotes" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${o.notes||''}</textarea></div>

      <div style="display:flex;gap:12px;margin-top:16px">
        <button class="btn btn-primary" onclick="updateOrderStatus(${o.id})">Save</button>
        <button class="btn btn-danger" onclick="if(confirm('Delete this order?')){deleteOrder(${o.id});this.closest('.admin-modal').remove()}">Delete</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { toast('Failed to load order', 'error'); }
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
    toast('Order updated');
    fetchOrders();
  } catch(e) { toast(e.message, 'error'); }
}

async function checkCourierStatus(orderId, consignmentId, courier) {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:480px">
    <div class="modal-header" style="background:linear-gradient(135deg,#0e7490,#0f766e)">
      <h2 style="color:#fff">📦 Courier Tracking</h2>
      <button class="modal-close" style="color:#fff" onclick="this.closest('.admin-modal').remove()">&times;</button>
    </div>
    <div style="padding:24px;text-align:center">
      <div style="width:36px;height:36px;border:4px solid #e2e8f0;border-top-color:#0e7490;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto"></div>
      <p style="color:#94a3b8;margin-top:12px;font-size:13px">Checking status from courier API...</p>
    </div>
  </div>`;
  if (!document.querySelector('#bdSpinStyle')) {
    const st = document.createElement('style'); st.id = 'bdSpinStyle';
    st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  document.body.appendChild(modal);

  try {
    const data = await api(`/api/admin/orders/${orderId}/courier-live-status`);
    const s = data.status || {};
    const deliveryStatus = s.delivery_status || s.status || data.delivery_status || 'unknown';
    const statusColor = deliveryStatus === 'delivered' ? '#16a34a' : deliveryStatus === 'cancelled' || deliveryStatus === 'returned' ? '#ef4444' : '#f59e0b';
    const statusEmoji = deliveryStatus === 'delivered' ? '✅' : deliveryStatus === 'cancelled' || deliveryStatus === 'returned' ? '❌' : '🚚';

    modal.querySelector('.admin-modal-content').innerHTML = `
      <div class="modal-header" style="background:linear-gradient(135deg,#0e7490,#0f766e)">
        <h2 style="color:#fff">📦 Courier Tracking</h2>
        <button class="modal-close" style="color:#fff" onclick="this.closest('.admin-modal').remove()">&times;</button>
      </div>
      <div style="padding:24px">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:48px;margin-bottom:8px">${statusEmoji}</div>
          <div style="font-size:22px;font-weight:800;color:${statusColor};text-transform:capitalize">${deliveryStatus}</div>
          <div style="color:#64748b;font-size:13px;margin-top:4px">Consignment: <code>${consignmentId}</code></div>
          <div style="color:#64748b;font-size:13px">Courier: ${courier || 'Steadfast'}</div>
        </div>
        ${data.note ? `<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px;font-size:13px;color:#374151">${data.note}</div>` : ''}
        ${s.delivery_charge ? `<div style="text-align:center;margin-top:12px;color:#64748b;font-size:13px">Delivery Charge: <strong>TK ${s.delivery_charge}</strong></div>` : ''}
        <div style="display:flex;gap:10px;margin-top:16px;justify-content:center">
          <button class="btn btn-primary" onclick="refreshCourierStatus(${orderId});this.closest('.admin-modal').remove()">🔄 Sync to DB</button>
          <button class="btn btn-ghost" onclick="this.closest('.admin-modal').remove()">Close</button>
        </div>
      </div>`;
  } catch(e) {
    modal.querySelector('.admin-modal-content').innerHTML = `
      <div class="modal-header"><h2>📦 Courier Tracking</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
      <div style="padding:30px;text-align:center"><p style="color:#ef4444">${e.message}</p></div>`;
  }
}

async function sendToCourier(orderId) {
  if (!confirm('Send this order to Steadfast courier?')) return;
  try {
    const result = await api('/api/admin/orders/' + orderId + '/send-courier', { method: 'POST' });
    toast('Steadfast — Tracking: ' + (result.consignment?.tracking_code || ''));
    document.querySelector('.admin-modal')?.remove();
    fetchOrders();
  } catch(e) { toast(e.message, 'error'); }
}

async function sendToPathao(orderId) {
  if (!confirm('Send this order to Pathao courier?')) return;
  try {
    const result = await api('/api/admin/orders/' + orderId + '/send-pathao', { method: 'POST' });
    toast('Pathao — Consignment: ' + (result.data?.consignment_id || ''));
    document.querySelector('.admin-modal')?.remove();
    fetchOrders();
  } catch(e) { toast(e.message, 'error'); }
}

async function sendToRedx(orderId) {
  if (!confirm('Send this order to RedX courier?')) return;
  try {
    const result = await api('/api/admin/orders/' + orderId + '/send-redx', { method: 'POST' });
    toast('RedX — Tracking ID: ' + (result.tracking_id || ''));
    document.querySelector('.admin-modal')?.remove();
    fetchOrders();
  } catch(e) { toast(e.message, 'error'); }
}

async function refreshCourierStatus(orderId) {
  try {
    const result = await api('/api/admin/orders/' + orderId + '/courier-status');
    toast('Courier status: ' + (result.delivery_status || 'unknown'));
    document.querySelector('.admin-modal')?.remove();
    viewOrder(orderId);
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteOrder(id) {
  try { await api('/api/admin/orders/' + id, { method: 'DELETE' }); toast('Order deleted'); fetchOrders(); }
  catch(e) { toast(e.message, 'error'); }
}

let _bdApiKey = null;
const _bdLocalCache = new Map();

async function _getBdKey() {
  if (_bdApiKey) return _bdApiKey;
  const r = await fetch('/api/admin/bdcourier-key', { credentials: 'same-origin' });
  const j = await r.json();
  _bdApiKey = j.key;
  return _bdApiKey;
}

function _fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

function _renderBdResult(modal, data, name, phone) {
  if (!data || data.error) {
    modal.querySelector('.admin-modal-content').innerHTML = `
      <div class="modal-header"><h2>🔍 Customer Risk Check</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
      <div style="padding:30px;text-align:center"><div style="font-size:40px;margin-bottom:12px">❌</div>
      <p style="color:#ef4444;font-weight:600">${(data && data.error) || 'Failed to check'}</p></div>`;
    return;
  }
  if (data.status === 'error') {
    modal.querySelector('.admin-modal-content').innerHTML = `
      <div class="modal-header" style="background:linear-gradient(135deg,#0f766e,#0e7490)">
        <h2 style="color:#fff">🔍 Customer Risk Check</h2>
        <button class="modal-close" style="color:#fff" onclick="this.closest('.admin-modal').remove()">&times;</button>
      </div>
      <div style="padding:30px;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <p style="font-size:18px;font-weight:700;color:#16a34a">কোনো রিপোর্ট পাওয়া যায়নি</p>
        <p style="color:#64748b;margin-top:8px">এই কাস্টমারের বিরুদ্ধে কোনো ফ্রড রিপোর্ট নেই</p>
        <p style="color:#94a3b8;margin-top:4px;font-size:13px">${name} — ${phone}</p>
      </div>`;
    return;
  }
  const d = data.data || {};
  const summary = d.summary || {};
  const reports = data.reports || [];
  const verdict = data.risk_verdict || {};
  const couriers = Object.entries(d).filter(([k]) => k !== 'summary');

  const verdictColors = { low_risk: '#16a34a', medium_risk: '#d97706', high_risk: '#ef4444' };
  const verdictEmoji = { low_risk: '✅', medium_risk: '⚠️', high_risk: '🚨' };
  const riskColor = verdictColors[verdict.level] || (summary.success_ratio >= 80 ? '#16a34a' : summary.success_ratio >= 60 ? '#d97706' : '#ef4444');
  const riskEmoji = verdictEmoji[verdict.level] || (summary.success_ratio >= 80 ? '✅' : summary.success_ratio >= 60 ? '⚠️' : '🚨');
  const riskLabel = verdict.label ? `${riskEmoji} ${verdict.label}` : `${riskEmoji} ${summary.success_ratio >= 80 ? 'কম ঝুঁকি' : summary.success_ratio >= 60 ? 'মাঝারি ঝুঁকি' : 'উচ্চ ঝুঁকি'}`;

  const reasonsHtml = verdict.reasons && verdict.reasons.length ? `
    <div style="margin-top:10px;background:rgba(0,0,0,.06);border-radius:8px;padding:8px 12px;text-align:left">
      ${verdict.reasons.map(r => `<div style="font-size:12px;color:#374151;padding:2px 0">• ${r}</div>`).join('')}
    </div>` : '';
  const actionHtml = verdict.action ? `<p style="margin-top:8px;font-size:13px;font-weight:600;color:${riskColor}">${verdict.action}</p>` : '';

  const courierCards = couriers.map(([, c]) => {
    const ratio = c.success_ratio || 0;
    const bc = ratio >= 80 ? '#16a34a' : ratio >= 60 ? '#d97706' : '#ef4444';
    return `<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:8px">
        <img src="${c.logo}" onerror="this.style.display='none'" style="height:22px;object-fit:contain">
        <span style="font-weight:600;font-size:14px">${c.name}</span>
        <span style="margin-left:auto;font-weight:700;color:${bc}">${ratio}%</span>
      </div>
      <div style="background:#e2e8f0;border-radius:99px;height:7px">
        <div style="width:${ratio}%;background:${bc};border-radius:99px;height:100%"></div>
      </div>
      <div style="display:flex;gap:12px;font-size:12px;color:#64748b">
        <span>মোট: <strong>${c.total_parcel}</strong></span>
        <span>সফল: <strong style="color:#16a34a">${c.success_parcel}</strong></span>
        <span>বাতিল: <strong style="color:#ef4444">${c.cancelled_parcel}</strong></span>
      </div></div>`;
  }).join('');

  const reportRows = reports.length ? reports.map(r => `
    <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <img src="${r.courierLogo}" onerror="this.style.display='none'" style="height:18px;object-fit:contain">
        <span style="font-weight:600;color:#c2410c">${r.courierName}</span>
        <span style="margin-left:auto;font-size:12px;color:#94a3b8">${new Date(r.created_at).toLocaleDateString('en-US')}</span>
      </div>
      <p style="font-size:13px;color:#7c2d12;margin:0"><strong>${r.name}</strong> — ${r.details}</p>
    </div>`).join('') : `<div style="text-align:center;color:#64748b;padding:16px">কোনো ফ্রড রিপোর্ট নেই ✅</div>`;

  modal.querySelector('.admin-modal-content').innerHTML = `
    <div class="modal-header" style="background:linear-gradient(135deg,#0f766e,#0e7490)">
      <h2 style="color:#fff">🔍 Customer Risk Check</h2>
      <button class="modal-close" style="color:#fff" onclick="this.closest('.admin-modal').remove()">&times;</button>
    </div>
    <div style="padding:20px;max-height:80vh;overflow-y:auto">
      <div style="background:#f8fafc;border:2px solid ${riskColor};border-radius:12px;padding:16px;text-align:center;margin-bottom:16px">
        <p style="font-size:22px;font-weight:800;color:${riskColor};margin:0">${riskLabel}</p>
        <p style="color:#0f172a;font-size:14px;margin-top:4px">${name} — ${phone}</p>
        ${actionHtml}${reasonsHtml}
        <div style="display:flex;justify-content:center;gap:24px;margin-top:12px">
          <div><div style="font-size:20px;font-weight:800;color:#0f172a">${summary.total_parcel||0}</div><div style="font-size:11px;color:#64748b">মোট</div></div>
          <div><div style="font-size:20px;font-weight:800;color:#16a34a">${summary.success_parcel||0}</div><div style="font-size:11px;color:#64748b">সফল</div></div>
          <div><div style="font-size:20px;font-weight:800;color:#ef4444">${summary.cancelled_parcel||0}</div><div style="font-size:11px;color:#64748b">বাতিল</div></div>
          <div><div style="font-size:20px;font-weight:800;color:${riskColor}">${summary.success_ratio||0}%</div><div style="font-size:11px;color:#64748b">সাফল্য</div></div>
        </div>
      </div>
      <h4 style="margin-bottom:10px;color:#334155;font-size:14px">কুরিয়ার ভিত্তিক বিশ্লেষণ</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">${courierCards}</div>
      <h4 style="margin-bottom:10px;color:#334155;font-size:14px">ফ্রড রিপোর্ট ${reports.length ? `<span style="background:#ef4444;color:#fff;border-radius:99px;padding:2px 8px;font-size:12px">${reports.length}</span>` : ''}</h4>
      ${reportRows}
    </div>`;
}

async function checkCustomerCourier(phone, name) {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:560px">
    <div class="modal-header" style="background:linear-gradient(135deg,#1a4a2e,#2d6e47);padding:18px 20px;border-radius:14px 14px 0 0;margin:-24px -24px 20px">
      <h2 style="color:#fff;font-size:16px">📦 Customer Courier Check</h2>
      <button class="modal-close" style="color:#fff" onclick="this.closest('.admin-modal').remove()">&times;</button>
    </div>
    <p style="color:#64748b;font-size:13px;margin-bottom:16px">Checking: <strong>${name}</strong> — ${phone}</p>
    <div style="text-align:center;padding:24px">
      <div style="width:36px;height:36px;border:4px solid #e2e8f0;border-top-color:#1a4a2e;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto"></div>
      <p style="color:#94a3b8;margin-top:10px;font-size:13px">Steadfast API থেকে data আনছে...</p>
    </div>
  </div>`;
  if (!document.querySelector('#bdSpinStyle')) {
    const st = document.createElement('style'); st.id = 'bdSpinStyle';
    st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  document.body.appendChild(modal);

  try {
    const data = await api('/api/admin/customer/courier-check', {
      method: 'POST',
      body: JSON.stringify({ phone })
    });

    const rateColor = parseFloat(data.rate) >= 70 ? '#16a34a' : parseFloat(data.rate) >= 40 ? '#d97706' : '#ef4444';
    const rateEmoji = parseFloat(data.rate) >= 70 ? '✅' : parseFloat(data.rate) >= 40 ? '⚠️' : '🚨';

    const statusBadge = (s) => {
      const colors = { delivered:'#16a34a', cancelled:'#6b7280', returned:'#ef4444', shipped:'#0e7490', processing:'#7c3aed', confirmed:'#1d4ed8', pending:'#c2410c' };
      return `<span style="display:inline-block;padding:2px 8px;border-radius:50px;font-size:11px;font-weight:600;background:${colors[s]||'#e5e7eb'}22;color:${colors[s]||'#6b7280'}">${s}</span>`;
    };

    const ordersHtml = data.orders.length === 0
      ? '<p style="text-align:center;color:#94a3b8;padding:12px">এই নম্বরে কোনো অর্ডার নেই</p>'
      : data.orders.map(o => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px">
          <div>
            <strong>${o.order_number}</strong>
            <span style="margin-left:8px;color:#94a3b8;font-size:11px">${new Date(o.date).toLocaleDateString('en-US')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:#64748b;font-size:12px">${o.courier||'Steadfast'}</span>
            ${statusBadge(o.courier_status || o.status)}
          </div>
        </div>`).join('');

    modal.querySelector('.admin-modal-content').innerHTML = `
      <div class="modal-header" style="background:linear-gradient(135deg,#1a4a2e,#2d6e47);padding:18px 20px;border-radius:14px 14px 0 0;margin:-24px -24px 20px">
        <h2 style="color:#fff;font-size:16px">📦 Customer Courier Check</h2>
        <button class="modal-close" style="color:#fff" onclick="this.closest('.admin-modal').remove()">&times;</button>
      </div>
      <p style="color:#64748b;font-size:13px;margin-bottom:16px"><strong>${name}</strong> — ${phone}</p>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
        <div style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#1e293b">${data.total}</div>
          <div style="font-size:11px;color:#64748b">মোট অর্ডার</div>
        </div>
        <div style="background:#f0fdf4;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#16a34a">${data.success}</div>
          <div style="font-size:11px;color:#16a34a">ডেলিভারি</div>
        </div>
        <div style="background:#fef2f2;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#ef4444">${data.cancel}</div>
          <div style="font-size:11px;color:#ef4444">বাতিল</div>
        </div>
        <div style="background:#fffbeb;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:${rateColor}">${data.rate}%</div>
          <div style="font-size:11px;color:${rateColor}">${rateEmoji} সাফল্য</div>
        </div>
      </div>

      ${data.total > 0 ? `
      <div style="background:#e2e8f0;border-radius:99px;height:8px;margin-bottom:20px">
        <div style="width:${data.rate}%;background:${rateColor};border-radius:99px;height:100%;transition:width .5s"></div>
      </div>` : ''}

      <div style="max-height:260px;overflow-y:auto">${ordersHtml}</div>`;
  } catch(e) {
    modal.querySelector('.admin-modal-content').innerHTML = `
      <div class="modal-header"><h2>📦 Courier Check</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
      <div style="padding:30px;text-align:center"><p style="color:#ef4444">${e.message}</p></div>`;
  }
}

async function checkCustomerBdCourier(phone, name) {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:640px">
    <div class="modal-header" style="background:linear-gradient(135deg,#0f766e,#0e7490)">
      <h2 style="color:#fff">🔍 Customer Risk Check</h2>
      <button class="modal-close" style="color:#fff" onclick="this.closest('.admin-modal').remove()">&times;</button>
    </div>
    <div style="padding:20px;text-align:center">
      <p style="color:#64748b;margin-bottom:6px">Checking delivery history for</p>
      <p style="font-size:18px;font-weight:700;color:#0f172a">${name} — ${phone}</p>
      <div style="margin-top:20px"><div style="width:40px;height:40px;border:4px solid #e2e8f0;border-top-color:#0f766e;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto"></div></div>
      <p style="color:#94a3b8;margin-top:12px;font-size:13px">Loading...</p>
    </div>
  </div>`;
  if (!document.querySelector('#bdSpinStyle')) {
    const st = document.createElement('style'); st.id = 'bdSpinStyle';
    st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  document.body.appendChild(modal);

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const cacheKey = 'bdc_' + cleanPhone;
  const cached = _bdLocalCache.get(cacheKey);
  if (cached && Date.now() - cached.t < 10 * 60 * 1000) {
    _renderBdResult(modal, cached.d, name, phone);
    return;
  }

  try {
    const data = await api('/api/admin/customer/bdcourier-check', {
      method: 'POST',
      body: JSON.stringify({ phone: cleanPhone })
    });
    _bdLocalCache.set(cacheKey, { d: data, t: Date.now() });
    _renderBdResult(modal, data, name, phone);
  } catch(e) {
    modal.querySelector('.admin-modal-content').innerHTML = `
      <div class="modal-header"><h2>🔍 Customer Risk Check</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
      <div style="padding:30px;text-align:center"><p style="color:#ef4444">${e.message}</p></div>`;
  }
}

// ===== PRODUCTS =====
let productsPage = 1;

async function loadProducts() {
  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <div class="search-bar">
          <input type="text" placeholder="Search products..." id="prodSearch" onkeyup="if(event.key==='Enter')fetchProducts()">
        </div>
        <button class="btn btn-primary" onclick="showProductForm()">+ New Product</button>
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

    document.getElementById('productsTable').innerHTML = `<div class="table-responsive"><table><thead><tr><th>Image</th><th>Product</th><th>Price</th><th>Stock</th><th>Category</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${data.products.map(p => `<tr>
      <td>${p.image ? `<img src="${p.image}" style="width:40px;height:40px;border-radius:6px;object-fit:cover">` : '📦'}</td>
      <td><strong>${p.name_bn || p.name}</strong><br><small style="color:#999">SKU: ${p.sku||'-'}</small></td>
      <td>TK ${p.sale_price || p.price}${p.sale_price ? `<br><small style="text-decoration:line-through;color:#999">TK ${p.price}</small>` : ''}</td>
      <td style="color:${p.stock<=p.low_stock_alert?'#dc2626':'#16a34a'}">${p.stock}</td>
      <td>${p.category_name || '-'}</td>
      <td>${p.is_active ? '<span style="color:#16a34a">Active</span>' : '<span style="color:#999">Inactive</span>'}</td>
      <td class="table-actions">
        <button class="btn btn-sm btn-ghost" onclick="showProductForm(${p.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="if(confirm('Delete?'))deleteProduct(${p.id})">✕</button>
      </td>
    </tr>`).join('')}</tbody></table></div>`;

    let pagHtml = `<button ${data.page<=1?'disabled':''} onclick="productsPage--;fetchProducts()">← Prev</button><span>Page ${data.page}/${data.pages||1}</span><button ${data.page>=data.pages?'disabled':''} onclick="productsPage++;fetchProducts()">Next →</button>`;
    document.getElementById('productsPagination').innerHTML = pagHtml;
  } catch(e) { document.getElementById('productsTable').innerHTML = '<p style="padding:20px;color:red">Load failed</p>'; }
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
    <div class="modal-header"><h2>${id ? 'Edit Product' : 'New Product'}</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveProduct(event, ${id || 'null'})">
      <div class="form-grid">
        <div class="form-group"><label>Product Name (English)</label><input id="pName" value="${product.name}" required></div>
        <div class="form-group"><label>Product Name (Bengali)</label><input id="pNameBn" value="${product.name_bn||''}"></div>
        <div class="form-group"><label>Price (TK)</label><input type="number" id="pPrice" value="${product.price}" required></div>
        <div class="form-group"><label>Sale Price</label><input type="number" id="pSalePrice" value="${product.sale_price||''}"></div>
        <div class="form-group"><label>Cost Price</label><input type="number" id="pCostPrice" value="${product.cost_price||''}"></div>
        <div class="form-group"><label>SKU</label><input id="pSku" value="${product.sku||''}"></div>
        <div class="form-group"><label>Stock</label><input type="number" id="pStock" value="${product.stock}"></div>
        <div class="form-group"><label>Low Stock Alert</label><input type="number" id="pLowStock" value="${product.low_stock_alert}"></div>
        <div class="form-group"><label>Category</label><select id="pCategory"><option value="">Select</option>${cats.map(c=>`<option value="${c.id}" ${c.id==product.category_id?'selected':''}>${c.name_bn||c.name}</option>`).join('')}</select></div>
        <div class="form-group"><label>Tags</label><input id="pTags" value="${product.tags||''}"></div>
      </div>
      <div class="form-group"><label>Description (English)</label><textarea id="pDesc" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${product.description||''}</textarea></div>
      <div class="form-group"><label>Description (Bengali)</label><textarea id="pDescBn" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${product.description_bn||''}</textarea></div>
      <div class="form-group"><label>Upload Image</label><input type="file" id="pImage" accept="image/*" onchange="uploadImage(this)"><input type="hidden" id="pImageUrl" value="${product.image||''}">
        ${product.image ? `<img src="${product.image}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;margin-top:8px" id="pImagePreview">` : '<div id="pImagePreview"></div>'}
      </div>
      <div style="display:flex;gap:16px;margin-bottom:16px">
        <label><input type="checkbox" id="pActive" ${product.is_active?'checked':''}> Active</label>
        <label><input type="checkbox" id="pFeatured" ${product.is_featured?'checked':''}> Featured</label>
      </div>
      <button type="submit" class="btn btn-primary">${id ? 'Update' : 'Add Product'}</button>
    </form>
    ${id ? `<div style="margin-top:24px;border-top:2px solid var(--border);padding-top:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="font-size:16px">Product Variants</h3>
        <button class="btn btn-sm btn-primary" onclick="showAddVariantForm(${id})">+ Add Variant</button>
      </div>
      <div id="variantsList">Loading variants...</div>
    </div>` : ''}
  </div>`;
  document.body.appendChild(modal);
  if (id) loadVariants(id);
}

async function loadVariants(productId) {
  const el = document.getElementById('variantsList');
  if (!el) return;
  try {
    const variants = await api('/api/admin/products/' + productId + '/variants');
    if (variants.length === 0) {
      el.innerHTML = '<p style="color:#999;font-size:13px">No variants yet. Add variants like Size, Color, etc.</p>';
      return;
    }
    el.innerHTML = `<div class="table-responsive"><table><thead><tr><th>Name</th><th>Value</th><th>Price +/-</th><th>Stock</th><th>SKU</th><th>Action</th></tr></thead><tbody>
    ${variants.map(v => `<tr>
      <td><strong>${v.name}</strong></td>
      <td>${v.value}</td>
      <td>${v.price_adjustment > 0 ? '+' : ''}${v.price_adjustment || 0} TK</td>
      <td>${v.stock}</td>
      <td>${v.sku || '-'}</td>
      <td class="table-actions">
        <button class="btn btn-sm btn-ghost" onclick="editVariant(${v.id}, ${productId})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="if(confirm('Delete variant?'))deleteVariant(${v.id}, ${productId})">✕</button>
      </td>
    </tr>`).join('')}</tbody></table></div>`;
  } catch(e) { el.innerHTML = '<p style="color:red">Failed to load variants</p>'; }
}

function showAddVariantForm(productId) {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.style.zIndex = '300';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:450px">
    <div class="modal-header"><h2>Add Variant</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveVariant(event, ${productId})">
      <div class="form-grid">
        <div class="form-group"><label>Variant Name</label><input id="vName" required placeholder="e.g. Size, Color, Pack"><small style="color:#888">e.g. Size, Color, Pack Type</small></div>
        <div class="form-group"><label>Value</label><input id="vValue" required placeholder="e.g. Large, Red, 100pcs"></div>
        <div class="form-group"><label>Price Adjustment (TK)</label><input type="number" id="vPriceAdj" value="0" step="any"><small style="color:#888">+ or - from base price</small></div>
        <div class="form-group"><label>Stock</label><input type="number" id="vStock" value="0"></div>
      </div>
      <div class="form-group"><label>SKU (optional)</label><input id="vSku" placeholder="Variant SKU"></div>
      <button type="submit" class="btn btn-primary">Add Variant</button>
    </form>
  </div>`;
  document.body.appendChild(modal);
}

async function saveVariant(e, productId) {
  e.preventDefault();
  try {
    await api('/api/admin/products/' + productId + '/variants', { method: 'POST', body: JSON.stringify({
      name: document.getElementById('vName').value,
      value: document.getElementById('vValue').value,
      price_adjustment: Number(document.getElementById('vPriceAdj').value) || 0,
      stock: Number(document.getElementById('vStock').value) || 0,
      sku: document.getElementById('vSku').value || null
    })});
    document.querySelectorAll('.admin-modal')[document.querySelectorAll('.admin-modal').length - 1].remove();
    toast('Variant added');
    loadVariants(productId);
  } catch(e) { toast(e.message, 'error'); }
}

function editVariant(variantId, productId) {
  // For simplicity, delete and re-add
  showAddVariantForm(productId);
}

async function deleteVariant(variantId, productId) {
  try {
    await api('/api/admin/variants/' + variantId, { method: 'DELETE' });
    toast('Variant deleted');
    loadVariants(productId);
  } catch(e) { toast(e.message, 'error'); }
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
  } catch(e) { toast('Upload failed', 'error'); }
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
    toast(id ? 'Product updated' : 'Product added');
    fetchProducts();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteProduct(id) {
  try { await api('/api/admin/products/' + id, { method: 'DELETE' }); toast('Deleted'); fetchProducts(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== CATEGORIES =====
async function loadCategories() {
  const c = document.getElementById('pageContent');
  try {
    const cats = await api('/api/admin/categories');
    c.innerHTML = `<div class="table-wrap">
      <div class="table-header"><h2>Categories</h2><button class="btn btn-primary" onclick="showCategoryForm()">+ New Category</button></div>
      <div class="table-responsive"><table><thead><tr><th>Name</th><th>Name (Bengali)</th><th>Slug</th><th>Active</th><th>Action</th></tr></thead><tbody>
      ${cats.map(c => `<tr><td>${c.name}</td><td>${c.name_bn||'-'}</td><td>${c.slug}</td><td>${c.is_active?'Yes':'No'}</td>
        <td class="table-actions"><button class="btn btn-sm btn-danger" onclick="if(confirm('Delete?'))deleteCategory(${c.id})">✕</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">Load failed</p>'; }
}

function showCategoryForm() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:400px">
    <div class="modal-header"><h2>New Category</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveCategory(event)">
      <div class="form-group"><label>Name (English)</label><input id="catName" required></div>
      <div class="form-group"><label>Name (Bengali)</label><input id="catNameBn"></div>
      <button type="submit" class="btn btn-primary">Add</button>
    </form></div>`;
  document.body.appendChild(modal);
}

async function saveCategory(e) {
  e.preventDefault();
  try {
    await api('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name: document.getElementById('catName').value, name_bn: document.getElementById('catNameBn').value }) });
    document.querySelector('.admin-modal').remove();
    toast('Category added');
    loadCategories();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteCategory(id) {
  try { await api('/api/admin/categories/' + id, { method: 'DELETE' }); toast('Deleted'); loadCategories(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== CUSTOMERS =====
let customersPage = 1;

async function loadCustomers() {
  const c = document.getElementById('pageContent');
  c.innerHTML = `<div class="table-wrap">
    <div class="table-header"><div class="search-bar"><input type="text" placeholder="Search customers..." id="custSearch" onkeyup="if(event.key==='Enter')fetchCustomers()"></div></div>
    <div id="customersTable"></div>
    <div class="pagination" id="customersPagination"></div>
  </div>`;
  fetchCustomers();
}

async function fetchCustomers() {
  try {
    const search = document.getElementById('custSearch')?.value || '';
    const data = await api(`/api/admin/customers?page=${customersPage}&search=${search}`);
    document.getElementById('customersTable').innerHTML = `<div class="table-responsive"><table><thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>Orders</th><th>Total Spent</th><th>Fraud Score</th><th>Action</th></tr></thead><tbody>
    ${data.customers.map(c => `<tr>
      <td><strong>${c.name}</strong>${c.is_blocked?'<span style="color:red;font-size:11px"> (Blocked)</span>':''}</td>
      <td>${c.phone}</td><td>${c.address||'-'}</td><td>${c.total_orders}</td><td>TK ${c.total_spent}</td>
      <td style="color:${c.fraud_score>50?'#dc2626':c.fraud_score>20?'#f59e0b':'#16a34a'}">${c.fraud_score}</td>
      <td class="table-actions"><button class="btn btn-sm btn-ghost" onclick="viewCustomer(${c.id})">Details</button></td>
    </tr>`).join('')}</tbody></table></div>`;
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
        <div class="detail-box"><h4>Info</h4>
          <div class="detail-row"><span>Phone:</span><span>${c.phone}</span></div>
          <div class="detail-row"><span>Address:</span><span>${c.address||'-'}</span></div>
          <div class="detail-row"><span>Total Orders:</span><span>${c.total_orders}</span></div>
          <div class="detail-row"><span>Total Spent:</span><span>TK ${c.total_spent}</span></div>
          <div class="detail-row"><span>Fraud Score:</span><span>${c.fraud_score}</span></div>
        </div>
        <div class="detail-box"><h4>Actions</h4>
          <div class="form-group"><label>Notes</label><textarea id="custNotes" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-family:inherit">${c.notes||''}</textarea></div>
          <label><input type="checkbox" id="custBlocked" ${c.is_blocked?'checked':''}> Block Customer</label>
          <button class="btn btn-primary" style="margin-top:12px" onclick="updateCustomer(${c.id})">Save</button>
        </div>
      </div>
      <h4 style="margin:16px 0 8px">Order History</h4>
      <table><thead><tr><th>Order</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${data.orders.map(o => `<tr><td>${o.order_number}</td><td>TK ${o.total_amount}</td><td><span class="badge badge-${o.status}">${o.status}</span></td><td>${new Date(o.created_at).toLocaleDateString('en-US')}</td></tr>`).join('')}
      </tbody></table>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { toast('Load failed', 'error'); }
}

async function updateCustomer(id) {
  try {
    await api('/api/admin/customers/' + id, { method: 'PUT', body: JSON.stringify({ notes: document.getElementById('custNotes').value, is_blocked: document.getElementById('custBlocked').checked ? 1 : 0 }) });
    document.querySelector('.admin-modal').remove();
    toast('Updated');
    fetchCustomers();
  } catch(e) { toast(e.message, 'error'); }
}

// ===== COUPONS =====
async function loadCoupons() {
  const c = document.getElementById('pageContent');
  try {
    const coupons = await api('/api/admin/coupons');
    c.innerHTML = `<div class="table-wrap">
      <div class="table-header"><h2>Coupons</h2><button class="btn btn-primary" onclick="showCouponForm()">+ New Coupon</button></div>
      <div class="table-responsive"><table><thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Minimum</th><th>Usage</th><th>Expires</th><th>Action</th></tr></thead><tbody>
      ${coupons.map(cp => `<tr>
        <td><strong>${cp.code}</strong></td><td>${cp.type==='percent'?'Percentage':'Fixed'}</td>
        <td>${cp.type==='percent'?cp.value+'%':'TK '+cp.value}</td><td>TK ${cp.min_order}</td>
        <td>${cp.used_count}${cp.max_uses?'/'+cp.max_uses:''}</td><td>${cp.expires_at||'No limit'}</td>
        <td><button class="btn btn-sm btn-danger" onclick="if(confirm('Delete?'))deleteCoupon(${cp.id})">✕</button></td>
      </tr>`).join('')}</tbody></table></div></div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">Load failed</p>'; }
}

function showCouponForm() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:450px">
    <div class="modal-header"><h2>New Coupon</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveCoupon(event)">
      <div class="form-group"><label>Coupon Code</label><input id="cpCode" required placeholder="SAVE20"></div>
      <div class="form-grid">
        <div class="form-group"><label>Type</label><select id="cpType"><option value="fixed">Fixed (TK)</option><option value="percent">Percentage (%)</option></select></div>
        <div class="form-group"><label>Value</label><input type="number" id="cpValue" required></div>
        <div class="form-group"><label>Minimum Order</label><input type="number" id="cpMin" value="0"></div>
        <div class="form-group"><label>Max Uses</label><input type="number" id="cpMax" placeholder="Unlimited"></div>
      </div>
      <div class="form-group"><label>Expiry Date</label><input type="date" id="cpExpires"></div>
      <button type="submit" class="btn btn-primary">Create Coupon</button>
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
    toast('Coupon created');
    loadCoupons();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteCoupon(id) {
  try { await api('/api/admin/coupons/' + id, { method: 'DELETE' }); toast('Deleted'); loadCoupons(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== EXPENSES =====
async function loadExpenses() {
  const c = document.getElementById('pageContent');
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    const data = await api('/api/admin/expenses?month=' + currentMonth);
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div><strong>Total Expenses (${currentMonth}):</strong> TK ${data.total}</div>
      <div style="display:flex;gap:8px">
        <input type="month" id="expMonth" value="${currentMonth}" onchange="reloadExpenses()">
        <button class="btn btn-primary" onclick="showExpenseForm()">+ Add Expense</button>
      </div>
    </div>
    <div class="table-wrap"><div class="table-responsive"><table><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Description</th><th>Action</th></tr></thead><tbody>
    ${data.expenses.map(e => `<tr><td>${e.date}</td><td>${e.category}</td><td>TK ${e.amount}</td><td>${e.description||'-'}</td>
      <td><button class="btn btn-sm btn-danger" onclick="if(confirm('Delete?'))deleteExpense(${e.id})">✕</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
  } catch(e) { c.innerHTML = '<p style="color:red">Load failed</p>'; }
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
    <div class="modal-header"><h2>Add Expense</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveExpense(event)">
      <div class="form-group"><label>Category</label><select id="expCat"><option>Courier</option><option>Advertising</option><option>Product Purchase</option><option>Office</option><option>Salary</option><option>Other</option></select></div>
      <div class="form-group"><label>Amount (TK)</label><input type="number" id="expAmount" required></div>
      <div class="form-group"><label>Description</label><input id="expDesc"></div>
      <div class="form-group"><label>Date</label><input type="date" id="expDate" value="${new Date().toISOString().split('T')[0]}"></div>
      <button type="submit" class="btn btn-primary">Save</button>
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
    toast('Expense added');
    loadExpenses();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteExpense(id) {
  try { await api('/api/admin/expenses/' + id, { method: 'DELETE' }); toast('Deleted'); loadExpenses(); }
  catch(e) { toast(e.message, 'error'); }
}

// ===== REPORTS =====
let reportTab = 'sales';
let reportRange = 'this_month';

function _reportDates(range) {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  if (range === 'today') { const t=fmt(now); return {from:t,to:t}; }
  if (range === 'yesterday') { const y=new Date(now); y.setDate(y.getDate()-1); const s=fmt(y); return {from:s,to:s}; }
  if (range === 'last7') { const f=new Date(now); f.setDate(f.getDate()-6); return {from:fmt(f),to:fmt(now)}; }
  if (range === 'this_month') { return {from:`${now.getFullYear()}-${pad(now.getMonth()+1)}-01`,to:fmt(now)}; }
  if (range === 'last_month') {
    const f=new Date(now.getFullYear(),now.getMonth()-1,1);
    const t=new Date(now.getFullYear(),now.getMonth(),0);
    return {from:fmt(f),to:fmt(t)};
  }
  return {from:'',to:''};
}

async function loadReports() {
  const c = document.getElementById('pageContent');
  const tabs = ['sales','products','customers','courier','profit'];
  const tabLabels = {sales:'📊 Sales',products:'🏷 Products',customers:'👥 Customers',courier:'🚚 Courier',profit:'💰 Profit'};
  const ranges = [
    {key:'today',label:'Today'},
    {key:'yesterday',label:'Yesterday'},
    {key:'last7',label:'Last 7 Days'},
    {key:'this_month',label:'This Month'},
    {key:'last_month',label:'Last Month'},
    {key:'all',label:'All Time'},
  ];

  c.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      ${ranges.map(r=>`<button class="btn btn-sm ${reportRange===r.key?'btn-primary':'btn-ghost'}" onclick="reportRange='${r.key}';loadReports()">${r.label}</button>`).join('')}
    </div>
    <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid #e5e7eb">
      ${tabs.map(t=>`<button onclick="reportTab='${t}';loadReports()" style="padding:10px 18px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;color:${reportTab===t?'#0f766e':'#6b7280'};border-bottom:${reportTab===t?'2px solid #0f766e':'2px solid transparent'};margin-bottom:-2px">${tabLabels[t]}</button>`).join('')}
    </div>
    <div id="reportBody"><div style="text-align:center;padding:40px;color:#94a3b8">Loading...</div></div>`;

  const {from,to} = _reportDates(reportRange);
  const qs = `${from?`from=${from}&`:''}${to?`to=${to}`:''}`;

  try {
    const rb = document.getElementById('reportBody');
    if (reportTab === 'sales') {
      const [sales] = await Promise.all([api(`/api/admin/reports/sales?group_by=day&${qs}`)]);
      const maxRev = Math.max(...sales.map(s=>parseFloat(s.revenue)||0), 1);
      const totalRev = sales.reduce((s,d)=>s+parseFloat(d.revenue||0),0);
      const totalOrd = sales.reduce((s,d)=>s+parseInt(d.orders||0),0);
      rb.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
          <div class="stat-card"><div class="label">Total Revenue</div><div class="value">TK ${Math.round(totalRev).toLocaleString()}</div></div>
          <div class="stat-card"><div class="label">Total Orders</div><div class="value">${totalOrd}</div></div>
          <div class="stat-card"><div class="label">Avg Order Value</div><div class="value">TK ${totalOrd?Math.round(totalRev/totalOrd):0}</div></div>
        </div>
        <div class="chart-box">
          <h3>Daily Sales</h3>
          <div class="chart-bars" style="min-height:150px">
            ${sales.slice(0,30).reverse().map(day=>{
              const h=Math.max((parseFloat(day.revenue)/maxRev)*130,4);
              return `<div class="chart-bar" style="height:${h}px" title="TK ${Math.round(day.revenue)}"><span class="chart-bar-val">TK ${Math.round(parseFloat(day.revenue)/1000)}k</span><span class="chart-bar-label">${day.period.slice(5)}</span></div>`;
            }).join('')}
          </div>
        </div>
        <div class="table-wrap" style="margin-top:20px">
          <table><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th><th>Delivered</th></tr></thead><tbody>
          ${sales.map(d=>`<tr><td>${d.period}</td><td>${d.orders}</td><td>TK ${Math.round(d.revenue).toLocaleString()}</td><td>TK ${Math.round(d.delivered_revenue||0).toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#999">No data</td></tr>'}
          </tbody></table>
        </div>`;

    } else if (reportTab === 'products') {
      const data = await api(`/api/admin/reports/products?${qs}`);
      rb.innerHTML = `
        <div class="table-wrap">
          <table><thead><tr><th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th></tr></thead><tbody>
          ${data.map((p,i)=>`<tr><td>${i+1}</td><td>${p.product_name}</td><td><strong>${p.total_sold}</strong></td><td>TK ${Math.round(p.total_revenue).toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#999">No data</td></tr>'}
          </tbody></table>
        </div>`;

    } else if (reportTab === 'customers') {
      const d = await api(`/api/admin/reports/customers?${qs}`);
      rb.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px">
          <div class="stat-card"><div class="label">New Customers</div><div class="value">${d.totalNew}</div></div>
          <div class="stat-card"><div class="label">Repeat Customers</div><div class="value">${d.repeatCount}</div></div>
        </div>
        <div class="table-wrap">
          <div class="table-header"><h2>Top Customers</h2></div>
          <table><thead><tr><th>Name</th><th>Phone</th><th>Orders</th><th>Total Spend</th></tr></thead><tbody>
          ${d.topCustomers.map(c=>`<tr><td>${c.name||'-'}</td><td>${c.phone}</td><td>${c.orders}</td><td>TK ${Math.round(c.total).toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#999">No data</td></tr>'}
          </tbody></table>
        </div>`;

    } else if (reportTab === 'courier') {
      const d = await api(`/api/admin/reports/courier?${qs}`);
      const oc = parseFloat(d.overall.rate)>=70?'#16a34a':'#dc2626';
      rb.innerHTML = `
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:48px;font-weight:800;color:${oc}">${d.overall.rate}%</div>
          <div style="color:#6b7280;margin-top:4px">${d.overall.total} total · ${d.overall.success} success · ${d.overall.cancel} cancel</div>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Courier</th><th>Total</th><th>Success</th><th>Cancel</th><th>Rate</th></tr></thead><tbody>
          ${d.couriers.length===0?'<tr><td colspan="5" style="text-align:center;color:#999">No courier data</td></tr>':
            d.couriers.map(c=>{
              const cr=parseFloat(c.rate);
              const col=cr>=70?'#16a34a':cr>=40?'#f59e0b':'#dc2626';
              return `<tr><td><strong>${c.courier}</strong></td><td>${c.total}</td><td style="color:#16a34a;font-weight:700">${c.success}</td><td style="color:#dc2626;font-weight:700">${c.cancel}</td><td style="font-weight:700;color:${col}">${c.rate}%</td></tr>`;
            }).join('')}
          </tbody></table>
        </div>`;

    } else if (reportTab === 'profit') {
      const d = await api(`/api/admin/reports/profit?${qs}`);
      const nc = d.netProfit>=0?'#16a34a':'#dc2626';
      rb.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px">
          <div class="stat-card"><div class="label">Revenue (Delivered)</div><div class="value" style="color:#0f766e">TK ${Math.round(d.revenue).toLocaleString()}</div></div>
          <div class="stat-card"><div class="label">Purchase Cost</div><div class="value" style="color:#dc2626">TK ${Math.round(d.purchaseCost).toLocaleString()}</div></div>
          <div class="stat-card"><div class="label">Gross Profit</div><div class="value">TK ${Math.round(d.grossProfit).toLocaleString()}</div></div>
          <div class="stat-card"><div class="label">Expenses</div><div class="value" style="color:#dc2626">TK ${Math.round(d.expenses).toLocaleString()}</div></div>
          <div class="stat-card"><div class="label">Ad Spend</div><div class="value" style="color:#dc2626">TK ${Math.round(d.adSpend).toLocaleString()}</div></div>
          <div class="stat-card" style="border:2px solid ${nc}"><div class="label">Net Profit</div><div class="value" style="color:${nc};font-size:28px">TK ${Math.round(d.netProfit).toLocaleString()}</div></div>
        </div>
        <div class="table-wrap">
          <table><tbody>
            <tr><td>Revenue</td><td style="text-align:right;color:#16a34a">+ TK ${Math.round(d.revenue).toLocaleString()}</td></tr>
            <tr><td>Purchase Cost</td><td style="text-align:right;color:#dc2626">- TK ${Math.round(d.purchaseCost).toLocaleString()}</td></tr>
            <tr style="font-weight:700;border-top:2px solid #e5e7eb"><td>Gross Profit</td><td style="text-align:right">TK ${Math.round(d.grossProfit).toLocaleString()}</td></tr>
            <tr><td>Expenses</td><td style="text-align:right;color:#dc2626">- TK ${Math.round(d.expenses).toLocaleString()}</td></tr>
            <tr><td>Ad Spend</td><td style="text-align:right;color:#dc2626">- TK ${Math.round(d.adSpend).toLocaleString()}</td></tr>
            <tr style="font-weight:800;font-size:16px;border-top:2px solid #e5e7eb;color:${nc}"><td>Net Profit</td><td style="text-align:right">TK ${Math.round(d.netProfit).toLocaleString()}</td></tr>
          </tbody></table>
        </div>`;
    }
  } catch(e) {
    document.getElementById('reportBody').innerHTML = `<p style="color:red;padding:20px">Error: ${e.message}</p>`;
  }
}

// ===== INVENTORY =====
let invTab = 'dashboard';

async function loadInventory() {
  const c = document.getElementById('pageContent');
  const tabs = ['dashboard','stock','lowstock','damaged','suppliers','purchases'];
  const tabLabels = {'dashboard':'📊 Dashboard','stock':'📦 সব পণ্য','lowstock':'⚠️ কম Stock','damaged':'🔴 নষ্ট পণ্য','suppliers':'🏢 Suppliers','purchases':'🛒 Purchase Orders'};

  c.innerHTML = `
    <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid #e5e7eb;flex-wrap:wrap">
      ${tabs.map(t=>`<button onclick="invTab='${t}';loadInventory()" style="padding:9px 14px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:${invTab===t?'#1a4a2e':'#6b7280'};border-bottom:${invTab===t?'2px solid #1a4a2e':'2px solid transparent'};margin-bottom:-2px;white-space:nowrap">${tabLabels[t]}</button>`).join('')}
    </div>
    <div id="invBody"><div style="text-align:center;padding:40px;color:#94a3b8">Loading...</div></div>`;

  const ib = document.getElementById('invBody');
  try {
    if (invTab === 'dashboard') {
      const [stats, products] = await Promise.all([
        api('/api/admin/inventory/stats'),
        api('/api/admin/inventory/overview')
      ]);
      const needReorder = products.filter(p=>parseInt(p.stock||0)<=parseInt(p.low_stock_alert||5) && parseInt(p.stock||0)>=0);
      ib.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
          <div class="stat-card highlight"><div class="label">মোট পণ্য</div><div class="value">${stats.totalProducts}</div><div class="sub">categories: ${stats.byCategory.length}</div></div>
          <div class="stat-card highlight"><div class="label">মোট Stock</div><div class="value">${stats.totalStock.toLocaleString()}</div><div class="sub">units</div></div>
          <div class="stat-card"><div class="label">Stock মূল্য (Cost)</div><div class="value" style="font-size:16px">TK ${stats.stockValue.toLocaleString()}</div><div class="sub">Sale: TK ${stats.saleValue.toLocaleString()}</div></div>
          <div class="stat-card"><div class="label">কম Stock</div><div class="value" style="color:#f59e0b">${stats.lowStock}</div><div class="sub">পণ্য কিনতে হবে</div></div>
          <div class="stat-card"><div class="label">শেষ হয়ে গেছে</div><div class="value" style="color:#dc2626">${stats.outOfStock}</div><div class="sub">out of stock</div></div>
          <div class="stat-card"><div class="label">নষ্ট পণ্য</div><div class="value" style="color:#7c3aed">${stats.totalDamaged}</div><div class="sub">damaged units</div></div>
        </div>

        <div class="dash-grid-2" style="margin-bottom:16px">
          <div class="table-wrap">
            <div class="table-header"><h2>📦 কিনতে হবে (Reorder List)</h2></div>
            ${needReorder.length===0
              ? '<p style="text-align:center;padding:20px;color:#16a34a">✅ সব পণ্যের stock ঠিক আছে</p>'
              : `<div class="table-responsive"><table><thead><tr><th>পণ্য</th><th>Stock</th><th>Alert</th><th>Status</th></tr></thead><tbody>
                ${needReorder.map(p=>`<tr>
                  <td><strong>${p.name_bn||p.name}</strong></td>
                  <td style="color:${parseInt(p.stock)===0?'#dc2626':'#f59e0b'};font-weight:700">${p.stock}</td>
                  <td>${p.low_stock_alert||5}</td>
                  <td><span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${parseInt(p.stock)===0?'#fee2e2':'#fef3c7'};color:${parseInt(p.stock)===0?'#dc2626':'#92400e'}">${parseInt(p.stock)===0?'শেষ হয়েছে':'কম আছে'}</span></td>
                </tr>`).join('')}
              </tbody></table></div>`}
          </div>
          <div class="table-wrap">
            <div class="table-header"><h2>📊 Category অনুযায়ী Stock</h2></div>
            <div style="padding:12px">
              ${stats.byCategory.map(c=>{
                const max = stats.byCategory[0]?.stock||1;
                const pct = Math.round((c.stock/max)*100);
                return `<div style="margin-bottom:10px">
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
                    <span>${c.name}</span><strong>${c.stock} units</strong>
                  </div>
                  <div style="background:#e5e7eb;border-radius:99px;height:7px">
                    <div style="width:${pct}%;background:#1a4a2e;border-radius:99px;height:100%"></div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <div class="table-header"><h2>🔴 নষ্ট পণ্যের তালিকা</h2></div>
          ${products.filter(p=>parseInt(p.damaged_stock||0)>0).length===0
            ? '<p style="text-align:center;padding:20px;color:#16a34a">✅ কোনো নষ্ট পণ্য নেই</p>'
            : `<div class="table-responsive"><table><thead><tr><th>পণ্য</th><th>নষ্ট</th><th>বর্তমান Stock</th></tr></thead><tbody>
              ${products.filter(p=>parseInt(p.damaged_stock||0)>0).map(p=>`<tr>
                <td>${p.name_bn||p.name}</td>
                <td style="color:#7c3aed;font-weight:700">${p.damaged_stock}</td>
                <td>${p.stock}</td>
              </tr>`).join('')}
            </tbody></table></div>`}
        </div>`;

    } else if (invTab === 'stock') {
      const products = await api('/api/admin/inventory/overview');
      ib.innerHTML = `
        <div class="table-wrap">
          <div class="table-header">
            <h2>সব পণ্যের Stock</h2>
            <input type="text" placeholder="পণ্য খুঁজুন..." oninput="filterInvTable(this.value)" style="padding:7px 12px;border:1.5px solid #e0d9cc;border-radius:8px;font-size:13px;min-width:180px">
          </div>
          <div class="table-responsive"><table id="invStockTable"><thead><tr><th>পণ্য</th><th>SKU</th><th>Category</th><th>দাম</th><th>Cost</th><th>Stock</th><th>Alert</th><th>নষ্ট</th><th>Update</th></tr></thead><tbody>
          ${products.map(p=>{
            const s=parseInt(p.stock||0); const low=s<=parseInt(p.low_stock_alert||5);
            const sc=s===0?'#dc2626':low?'#f59e0b':'#16a34a';
            return `<tr data-name="${(p.name_bn||p.name).toLowerCase()}">
              <td><strong>${p.name_bn||p.name}</strong><br><small style="color:#999">${p.name}</small></td>
              <td style="font-size:12px;color:#999">${p.sku||'-'}</td>
              <td>${p.category||'-'}</td>
              <td>TK ${p.sale_price||p.price}</td>
              <td>TK ${p.cost_price||0}</td>
              <td style="font-weight:700;color:${sc}">${s} ${s===0?'❌':low?'⚠️':'✅'}</td>
              <td>${p.low_stock_alert||5}</td>
              <td style="color:#7c3aed">${p.damaged_stock||0}</td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <input id="stk_${p.id}" type="number" value="${s}" style="width:65px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px">
                  <button class="btn btn-sm btn-primary" onclick="updateStock(${p.id})">✓</button>
                  <input id="dmg_${p.id}" type="number" value="${p.damaged_stock||0}" style="width:55px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px" title="নষ্ট পণ্য">
                  <button class="btn btn-sm" style="background:#7c3aed;color:#fff;padding:4px 8px" onclick="updateDamaged(${p.id})" title="নষ্ট update">🔴</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
          </tbody></table></div>
        </div>`;

    } else if (invTab === 'lowstock') {
      const products = await api('/api/admin/inventory/overview');
      const low = products.filter(p=>parseInt(p.stock||0)<=parseInt(p.low_stock_alert||5));
      ib.innerHTML = low.length===0
        ? `<div style="text-align:center;padding:60px;color:#16a34a;font-size:18px">✅ সব পণ্যের stock ঠিক আছে</div>`
        : `<div class="table-wrap">
            <div class="table-header"><h2>⚠️ কম Stock — কিনতে হবে</h2><span style="color:#f59e0b;font-size:13px">${low.length}টি পণ্য</span></div>
            <div class="table-responsive"><table><thead><tr><th>পণ্য</th><th>Category</th><th>বর্তমান Stock</th><th>Alert Level</th><th>কতটুকু লাগবে</th><th>Status</th><th>Update</th></tr></thead><tbody>
            ${low.sort((a,b)=>parseInt(a.stock||0)-parseInt(b.stock||0)).map(p=>{
              const s=parseInt(p.stock||0); const al=parseInt(p.low_stock_alert||5);
              return `<tr style="background:${s===0?'#fff5f5':'#fffbeb'}">
                <td><strong>${p.name_bn||p.name}</strong></td>
                <td>${p.category||'-'}</td>
                <td style="font-weight:700;color:${s===0?'#dc2626':'#f59e0b'};font-size:18px">${s}</td>
                <td style="color:#6b7280">${al}</td>
                <td style="color:#1a4a2e;font-weight:700">কমপক্ষে ${Math.max(al*2-s,al)} টা</td>
                <td><span style="font-size:11px;padding:3px 10px;border-radius:20px;background:${s===0?'#fee2e2':'#fef3c7'};color:${s===0?'#dc2626':'#92400e'};font-weight:700">${s===0?'❌ শেষ হয়েছে':'⚠️ কম আছে'}</span></td>
                <td><div style="display:flex;gap:4px"><input id="stk_${p.id}" type="number" value="${s}" style="width:65px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px"><button class="btn btn-sm btn-primary" onclick="updateStock(${p.id})">✓ Save</button></div></td>
              </tr>`;
            }).join('')}
            </tbody></table></div>
          </div>`;

    } else if (invTab === 'damaged') {
      const products = await api('/api/admin/inventory/overview');
      ib.innerHTML = `
        <div class="table-wrap">
          <div class="table-header"><h2>🔴 নষ্ট পণ্য ট্র্যাকিং</h2><span style="font-size:13px;color:#6b7280">Damaged stock রেকর্ড করুন</span></div>
          <div class="table-responsive"><table><thead><tr><th>পণ্য</th><th>বর্তমান Stock</th><th>নষ্ট পরিমাণ</th><th>ব্যবহারযোগ্য Stock</th><th>Update</th></tr></thead><tbody>
          ${products.map(p=>{
            const usable = parseInt(p.stock||0) - parseInt(p.damaged_stock||0);
            return `<tr>
              <td><strong>${p.name_bn||p.name}</strong><br><small style="color:#999">${p.category||'-'}</small></td>
              <td>${p.stock||0}</td>
              <td style="color:#7c3aed;font-weight:${parseInt(p.damaged_stock||0)>0?'700':'400'}">${p.damaged_stock||0}</td>
              <td style="font-weight:700;color:${usable<=0?'#dc2626':'#16a34a'}">${Math.max(0,usable)}</td>
              <td><div style="display:flex;gap:4px;align-items:center">
                <input id="dmg_${p.id}" type="number" value="${p.damaged_stock||0}" min="0" style="width:70px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px">
                <button class="btn btn-sm" style="background:#7c3aed;color:#fff" onclick="updateDamaged(${p.id})">Save</button>
              </div></td>
            </tr>`;
          }).join('')}
          </tbody></table></div>
        </div>`;

    } else if (invTab === 'suppliers') {
      const suppliers = await api('/api/admin/suppliers');
      ib.innerHTML = `
        <div style="margin-bottom:16px">
          <button class="btn btn-primary" onclick="showAddSupplier()">+ নতুন Supplier</button>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Notes</th><th>Action</th></tr></thead><tbody>
          ${suppliers.length===0?'<tr><td colspan="6" style="text-align:center;color:#999">কোনো supplier নেই</td></tr>':
            suppliers.map(s=>`<tr>
              <td><strong>${s.name}</strong></td>
              <td>${s.phone||'-'}</td>
              <td>${s.email||'-'}</td>
              <td>${s.address||'-'}</td>
              <td>${s.notes||'-'}</td>
              <td><button class="btn btn-sm btn-danger" onclick="deleteSupplier(${s.id},'${s.name.replace(/'/g,"\\'")}')">Delete</button></td>
            </tr>`).join('')}
          </tbody></table>
        </div>`;

    } else if (invTab === 'purchases') {
      const [purchases, products, suppliers] = await Promise.all([
        api('/api/admin/purchases'),
        api('/api/admin/inventory/overview'),
        api('/api/admin/suppliers'),
      ]);
      const totalSpend = purchases.reduce((s,p)=>s+parseFloat(p.total_cost||0),0);
      ib.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div class="stat-card" style="min-width:200px"><div class="label">Total Purchase Cost</div><div class="value" style="color:#dc2626">TK ${Math.round(totalSpend).toLocaleString()}</div></div>
          <button class="btn btn-primary" onclick="showAddPurchase()">+ নতুন Purchase</button>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Date</th><th>Product</th><th>Supplier</th><th>Qty</th><th>Unit Cost</th><th>Total</th><th>Notes</th><th>Action</th></tr></thead><tbody>
          ${purchases.length===0?'<tr><td colspan="8" style="text-align:center;color:#999">কোনো purchase নেই</td></tr>':
            purchases.map(p=>`<tr>
              <td style="white-space:nowrap">${p.purchase_date?.slice(0,10)||'-'}</td>
              <td>${p.product_name}</td>
              <td>${p.supplier||p.supplier_name||'-'}</td>
              <td><strong>${p.quantity}</strong></td>
              <td>TK ${p.cost_per_unit}</td>
              <td style="font-weight:700">TK ${Math.round(p.total_cost).toLocaleString()}</td>
              <td>${p.notes||'-'}</td>
              <td><button class="btn btn-sm btn-danger" onclick="deletePurchase(${p.id})">Delete</button></td>
            </tr>`).join('')}
          </tbody></table>
        </div>`;
      window._invProducts = products;
      window._invSuppliers = suppliers;
    }
  } catch(e) { ib.innerHTML = `<p style="color:red;padding:20px">Error: ${e.message}</p>`; }
}

async function updateStock(productId) {
  const val = document.getElementById('stk_'+productId)?.value;
  if (val === undefined) return;
  try {
    await api('/api/admin/inventory/stock/'+productId, { method:'PATCH', body: JSON.stringify({stock:parseInt(val)}) });
    toast('Stock updated ✓');
  } catch(e) { toast('Failed: '+e.message, 'error'); }
}

async function updateDamaged(productId) {
  const val = document.getElementById('dmg_'+productId)?.value;
  if (val === undefined) return;
  try {
    await api('/api/admin/inventory/damaged/'+productId, { method:'PATCH', body: JSON.stringify({damaged_stock:parseInt(val)||0}) });
    toast('Damaged stock updated ✓');
  } catch(e) { toast('Failed: '+e.message, 'error'); }
}

function filterInvTable(q) {
  const rows = document.querySelectorAll('#invStockTable tbody tr');
  rows.forEach(r => {
    r.style.display = r.dataset.name?.includes(q.toLowerCase()) ? '' : 'none';
  });
}

function showAddSupplier() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:440px">
    <div class="modal-header"><h2>নতুন Supplier</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">×</button></div>
    <div style="padding:20px;display:grid;gap:12px">
      <div><label style="font-size:13px;font-weight:600">Name *</label><input id="supName" class="form-input" style="width:100%;box-sizing:border-box" placeholder="Supplier name"></div>
      <div><label style="font-size:13px;font-weight:600">Phone</label><input id="supPhone" class="form-input" style="width:100%;box-sizing:border-box" placeholder="01XXXXXXXXX"></div>
      <div><label style="font-size:13px;font-weight:600">Email</label><input id="supEmail" class="form-input" style="width:100%;box-sizing:border-box" placeholder="email@example.com"></div>
      <div><label style="font-size:13px;font-weight:600">Address</label><input id="supAddress" class="form-input" style="width:100%;box-sizing:border-box" placeholder="Address"></div>
      <div><label style="font-size:13px;font-weight:600">Notes</label><textarea id="supNotes" class="form-input" style="width:100%;box-sizing:border-box;height:60px" placeholder="Notes"></textarea></div>
      <button class="btn btn-primary" onclick="saveSupplier(this)">Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function saveSupplier(btn) {
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await api('/api/admin/suppliers', { method:'POST', body: JSON.stringify({
      name: document.getElementById('supName').value,
      phone: document.getElementById('supPhone').value,
      email: document.getElementById('supEmail').value,
      address: document.getElementById('supAddress').value,
      notes: document.getElementById('supNotes').value,
    })});
    document.querySelector('.admin-modal')?.remove();
    toast('Supplier added');
    loadInventory();
  } catch(e) { toast(e.message,'error'); btn.disabled=false; btn.textContent='Save'; }
}

async function deleteSupplier(id, name) {
  if (!confirm(`"${name}" delete করব?`)) return;
  try {
    await api('/api/admin/suppliers/'+id, {method:'DELETE'});
    toast('Supplier deleted');
    loadInventory();
  } catch(e) { toast(e.message,'error'); }
}

function showAddPurchase() {
  const products = window._invProducts || [];
  const suppliers = window._invSuppliers || [];
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:480px">
    <div class="modal-header"><h2>নতুন Purchase Order</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">×</button></div>
    <div style="padding:20px;display:grid;gap:12px">
      <div><label style="font-size:13px;font-weight:600">Product *</label>
        <select id="purProduct" class="form-input" style="width:100%;box-sizing:border-box" onchange="document.getElementById('purProductName').value=this.options[this.selectedIndex].text">
          <option value="">— Select Product —</option>
          ${products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}
          <option value="0">Other (type below)</option>
        </select>
      </div>
      <div><label style="font-size:13px;font-weight:600">Product Name (if Other)</label><input id="purProductName" class="form-input" style="width:100%;box-sizing:border-box" placeholder="Product name"></div>
      <div><label style="font-size:13px;font-weight:600">Supplier</label>
        <select id="purSupplier" class="form-input" style="width:100%;box-sizing:border-box">
          <option value="">— No Supplier —</option>
          ${suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label style="font-size:13px;font-weight:600">Quantity *</label><input id="purQty" type="number" class="form-input" style="width:100%;box-sizing:border-box" placeholder="0" oninput="calcPurTotal()"></div>
        <div><label style="font-size:13px;font-weight:600">Cost/Unit (TK) *</label><input id="purCost" type="number" class="form-input" style="width:100%;box-sizing:border-box" placeholder="0" oninput="calcPurTotal()"></div>
      </div>
      <div style="background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;font-size:16px;font-weight:700" id="purTotal">Total: TK 0</div>
      <div><label style="font-size:13px;font-weight:600">Purchase Date</label><input id="purDate" type="date" class="form-input" style="width:100%;box-sizing:border-box" value="${new Date().toISOString().split('T')[0]}"></div>
      <div><label style="font-size:13px;font-weight:600">Notes</label><input id="purNotes" class="form-input" style="width:100%;box-sizing:border-box" placeholder="Notes"></div>
      <button class="btn btn-primary" onclick="savePurchase(this)">Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

function calcPurTotal() {
  const q = parseFloat(document.getElementById('purQty')?.value||0);
  const c = parseFloat(document.getElementById('purCost')?.value||0);
  const el = document.getElementById('purTotal');
  if (el) el.textContent = `Total: TK ${Math.round(q*c).toLocaleString()}`;
}

async function savePurchase(btn) {
  btn.disabled=true; btn.textContent='Saving...';
  const prodSel = document.getElementById('purProduct');
  const prodId = prodSel?.value && prodSel.value !== '0' ? parseInt(prodSel.value) : null;
  const prodName = document.getElementById('purProductName')?.value?.trim() || prodSel?.options[prodSel.selectedIndex]?.text || '';
  try {
    await api('/api/admin/purchases', { method:'POST', body: JSON.stringify({
      supplier_id: document.getElementById('purSupplier')?.value || null,
      product_id: prodId,
      product_name: prodName,
      quantity: document.getElementById('purQty')?.value,
      cost_per_unit: document.getElementById('purCost')?.value,
      purchase_date: document.getElementById('purDate')?.value,
      notes: document.getElementById('purNotes')?.value,
    })});
    document.querySelector('.admin-modal')?.remove();
    toast('Purchase added — stock updated');
    loadInventory();
  } catch(e) { toast(e.message,'error'); btn.disabled=false; btn.textContent='Save'; }
}

async function deletePurchase(id) {
  if (!confirm('এই purchase delete করব? Stock কমে যাবে।')) return;
  try {
    await api('/api/admin/purchases/'+id, {method:'DELETE'});
    toast('Purchase deleted');
    loadInventory();
  } catch(e) { toast(e.message,'error'); }
}

// ===== FRAUD PROTECTION =====
let fraudTab = 'dashboard';
let fraudBlockedPage = 1;
let fraudBlockedType = '';
let fraudAttemptsPage = 1;
let fraudAttemptsReason = '';

async function loadFraudPage() {
  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="fraud-tabs">
      <button class="fraud-tab ${fraudTab==='dashboard'?'active':''}" onclick="fraudTab='dashboard';loadFraudPage()">Dashboard</button>
      <button class="fraud-tab ${fraudTab==='blocked'?'active':''}" onclick="fraudTab='blocked';loadFraudPage()">Blocked List</button>
      <button class="fraud-tab ${fraudTab==='attempts'?'active':''}" onclick="fraudTab='attempts';loadFraudPage()">Block Attempts</button>
      <button class="fraud-tab ${fraudTab==='settings'?'active':''}" onclick="fraudTab='settings';loadFraudPage()">Fraud Settings</button>
      <button class="fraud-tab ${fraudTab==='otp'?'active':''}" onclick="fraudTab='otp';loadFraudPage()">OTP Settings</button>
      <button class="fraud-tab ${fraudTab==='message'?'active':''}" onclick="fraudTab='message';loadFraudPage()">Block Message</button>
    </div>
    <div id="fraudContent"></div>`;

  const loaders = {
    dashboard: loadFraudDashboard,
    blocked: loadFraudBlocked,
    attempts: loadFraudAttempts,
    settings: loadFraudSettings,
    otp: loadFraudOtpSettings,
    message: loadFraudBlockMessage
  };
  if (loaders[fraudTab]) loaders[fraudTab]();
}

async function loadFraudDashboard() {
  const fc = document.getElementById('fraudContent');
  fc.innerHTML = '<p>Loading...</p>';

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const to = now.toISOString().split('T')[0];

  try {
    const d = await api(`/api/admin/fraud/dashboard?from=${from}&to=${to}`);

    const totalBlocks = (d.stats?.total_blocks) || 0;
    const phoneBlocks = (d.stats?.phone_blocks) || 0;
    const ipBlocks = (d.stats?.ip_blocks) || 0;
    const fingerprintBlocks = (d.stats?.fingerprint_blocks) || 0;
    const recentBlocks = d.recent_blocks || [];
    const topIPs = d.top_ips || [];
    const topPhones = d.top_phones || [];

    // Build chart from daily data if available
    const dailyData = d.daily || [];
    const maxBlk = Math.max(...dailyData.map(x => x.count || 0), 1);

    fc.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card" style="border-left:4px solid #dc2626"><div class="label">Total Blocks (This Month)</div><div class="value" style="color:#dc2626">${totalBlocks}</div></div>
      <div class="stat-card" style="border-left:4px solid #f59e0b"><div class="label">Phone Blocks</div><div class="value" style="color:#f59e0b">${phoneBlocks}</div></div>
      <div class="stat-card" style="border-left:4px solid #3b82f6"><div class="label">IP Blocks</div><div class="value" style="color:#3b82f6">${ipBlocks}</div></div>
      <div class="stat-card" style="border-left:4px solid #8b5cf6"><div class="label">Fingerprint Blocks</div><div class="value" style="color:#8b5cf6">${fingerprintBlocks}</div></div>
    </div>

    ${dailyData.length > 0 ? `<div class="chart-box">
      <h3>Daily Blocks (This Month)</h3>
      <div class="chart-bars">
        ${dailyData.map(day => {
          const h = Math.max(((day.count || 0) / maxBlk) * 130, 4);
          return `<div class="chart-bar" style="height:${h}px;background:#dc2626"><span class="chart-bar-val">${day.count || 0}</span><span class="chart-bar-label">${(day.date || '').slice(5)}</span></div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="table-wrap">
        <div class="table-header"><h2>Top Blocked IPs</h2></div>
        <table><thead><tr><th>IP Address</th><th>Block Count</th></tr></thead><tbody>
        ${topIPs.length === 0 ? '<tr><td colspan="2" style="text-align:center;color:#999;padding:20px">No data</td></tr>' :
          topIPs.map(ip => `<tr><td><code>${ip.value || ip.ip}</code></td><td>${ip.count}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="table-wrap">
        <div class="table-header"><h2>Top Blocked Phones</h2></div>
        <table><thead><tr><th>Phone Number</th><th>Block Count</th></tr></thead><tbody>
        ${topPhones.length === 0 ? '<tr><td colspan="2" style="text-align:center;color:#999;padding:20px">No data</td></tr>' :
          topPhones.map(ph => `<tr><td>${ph.value || ph.phone}</td><td>${ph.count}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>

    <div class="table-wrap" style="margin-top:20px">
      <div class="table-header"><h2>Recent Blocks</h2></div>
      <table><thead><tr><th>Type</th><th>Value</th><th>Reason</th><th>Date</th></tr></thead><tbody>
      ${recentBlocks.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">No recent blocks</td></tr>' :
        recentBlocks.map(b => `<tr>
          <td><span class="fraud-type-badge fraud-type-${b.type}">${b.type}</span></td>
          <td><code>${b.value}</code></td>
          <td>${b.reason || '-'}</td>
          <td>${b.created_at ? new Date(b.created_at).toLocaleString('en-US') : '-'}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;
  } catch(e) { fc.innerHTML = '<p style="color:red">Failed to load fraud dashboard</p>'; }
}

async function loadFraudBlocked() {
  const fc = document.getElementById('fraudContent');
  fc.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <div class="search-bar">
          <select id="fraudBlockedTypeFilter" onchange="fraudBlockedType=this.value;fraudBlockedPage=1;fetchFraudBlocked()">
            <option value="">All Types</option>
            <option value="phone" ${fraudBlockedType==='phone'?'selected':''}>Phone</option>
            <option value="ip" ${fraudBlockedType==='ip'?'selected':''}>IP</option>
            <option value="fingerprint" ${fraudBlockedType==='fingerprint'?'selected':''}>Fingerprint</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="showAddBlockForm()">+ Add Block</button>
      </div>
      <div id="fraudBlockedTable"></div>
      <div class="pagination" id="fraudBlockedPagination"></div>
    </div>`;
  fetchFraudBlocked();
}

async function fetchFraudBlocked() {
  try {
    const params = new URLSearchParams({ page: fraudBlockedPage });
    if (fraudBlockedType) params.set('type', fraudBlockedType);
    const data = await api('/api/admin/fraud/blocked?' + params);
    const entries = data.blocked || data.entries || [];
    const pages = data.pages || 1;
    const page = data.page || 1;

    document.getElementById('fraudBlockedTable').innerHTML = `<div class="table-responsive"><table><thead><tr><th>Type</th><th>Value</th><th>Reason</th><th>Duration</th><th>Expires</th><th>Created</th><th>Action</th></tr></thead><tbody>
    ${entries.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px">No blocked entries</td></tr>' :
      entries.map(b => `<tr>
        <td><span class="fraud-type-badge fraud-type-${b.type}">${b.type}</span></td>
        <td><code>${b.value}</code></td>
        <td>${b.reason || '-'}</td>
        <td>${b.duration_hours ? b.duration_hours + 'h' : 'Permanent'}</td>
        <td>${b.expires_at ? new Date(b.expires_at).toLocaleString('en-US') : 'Never'}</td>
        <td>${b.created_at ? new Date(b.created_at).toLocaleString('en-US') : '-'}</td>
        <td class="table-actions"><button class="btn btn-sm btn-danger" onclick="if(confirm('Remove this block?'))removeFraudBlock(${b.id})">Remove</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;

    let pagHtml = `<button ${page<=1?'disabled':''} onclick="fraudBlockedPage--;fetchFraudBlocked()">← Prev</button>`;
    pagHtml += `<span>Page ${page} / ${pages}</span>`;
    pagHtml += `<button ${page>=pages?'disabled':''} onclick="fraudBlockedPage++;fetchFraudBlocked()">Next →</button>`;
    document.getElementById('fraudBlockedPagination').innerHTML = pagHtml;
  } catch(e) { document.getElementById('fraudBlockedTable').innerHTML = '<p style="padding:20px;color:red">Load failed</p>'; }
}

function showAddBlockForm() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:450px">
    <div class="modal-header"><h2>Add Block</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveNewBlock(event)">
      <div class="form-group">
        <label>Block Type</label>
        <select id="blockType" required>
          <option value="phone">Phone Number</option>
          <option value="ip">IP Address</option>
          <option value="fingerprint">Browser Fingerprint</option>
        </select>
      </div>
      <div class="form-group">
        <label>Value</label>
        <input id="blockValue" required placeholder="Phone number, IP address, or fingerprint hash">
      </div>
      <div class="form-group">
        <label>Reason</label>
        <input id="blockReason" placeholder="Reason for blocking (optional)">
      </div>
      <div class="form-group">
        <label>Duration (hours)</label>
        <input type="number" id="blockDuration" placeholder="Leave empty for permanent block" min="1">
        <small style="color:#888">Leave empty to block permanently</small>
      </div>
      <button type="submit" class="btn btn-primary">Add Block</button>
    </form>
  </div>`;
  document.body.appendChild(modal);
}

async function saveNewBlock(e) {
  e.preventDefault();
  try {
    const body = {
      type: document.getElementById('blockType').value,
      value: document.getElementById('blockValue').value,
      reason: document.getElementById('blockReason').value || null,
      duration_hours: document.getElementById('blockDuration').value ? Number(document.getElementById('blockDuration').value) : null
    };
    await api('/api/admin/fraud/blocked', { method: 'POST', body: JSON.stringify(body) });
    document.querySelector('.admin-modal').remove();
    toast('Block added');
    fetchFraudBlocked();
  } catch(e) { toast(e.message, 'error'); }
}

async function removeFraudBlock(id) {
  try {
    await api('/api/admin/fraud/blocked/' + id, { method: 'DELETE' });
    toast('Block removed');
    fetchFraudBlocked();
  } catch(e) { toast(e.message, 'error'); }
}

async function loadFraudAttempts() {
  const fc = document.getElementById('fraudContent');
  fc.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <div class="search-bar">
          <select id="fraudAttemptsReasonFilter" onchange="fraudAttemptsReason=this.value;fraudAttemptsPage=1;fetchFraudAttempts()">
            <option value="">All Reasons</option>
            <option value="duplicate_order" ${fraudAttemptsReason==='duplicate_order'?'selected':''}>Duplicate Order</option>
            <option value="blocked_phone" ${fraudAttemptsReason==='blocked_phone'?'selected':''}>Blocked Phone</option>
            <option value="blocked_ip" ${fraudAttemptsReason==='blocked_ip'?'selected':''}>Blocked IP</option>
            <option value="blocked_fingerprint" ${fraudAttemptsReason==='blocked_fingerprint'?'selected':''}>Blocked Fingerprint</option>
            <option value="rate_limit" ${fraudAttemptsReason==='rate_limit'?'selected':''}>Rate Limit</option>
            <option value="otp_failed" ${fraudAttemptsReason==='otp_failed'?'selected':''}>OTP Failed</option>
          </select>
        </div>
        <button class="btn btn-danger" onclick="if(confirm('Clear all block attempt logs?'))clearFraudAttempts()">Clear Log</button>
      </div>
      <div id="fraudAttemptsTable"></div>
      <div class="pagination" id="fraudAttemptsPagination"></div>
    </div>`;
  fetchFraudAttempts();
}

async function fetchFraudAttempts() {
  try {
    const params = new URLSearchParams({ page: fraudAttemptsPage });
    if (fraudAttemptsReason) params.set('reason', fraudAttemptsReason);
    const data = await api('/api/admin/fraud/attempts?' + params);
    const attempts = data.attempts || data.entries || [];
    const pages = data.pages || 1;
    const page = data.page || 1;

    document.getElementById('fraudAttemptsTable').innerHTML = `<div class="table-responsive"><table><thead><tr><th>Date</th><th>Reason</th><th>Phone</th><th>IP Address</th><th>Details</th></tr></thead><tbody>
    ${attempts.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">No block attempts recorded</td></tr>' :
      attempts.map(a => `<tr>
        <td>${a.created_at ? new Date(a.created_at).toLocaleString('en-US') : '-'}</td>
        <td><span class="fraud-reason-badge">${(a.reason || '').replace(/_/g, ' ')}</span></td>
        <td>${a.phone || '-'}</td>
        <td><code>${a.ip || '-'}</code></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(a.details || '').replace(/"/g, '&quot;')}">${a.details || '-'}</td>
      </tr>`).join('')}
    </tbody></table></div>`;

    let pagHtml = `<button ${page<=1?'disabled':''} onclick="fraudAttemptsPage--;fetchFraudAttempts()">← Prev</button>`;
    pagHtml += `<span>Page ${page} / ${pages}</span>`;
    pagHtml += `<button ${page>=pages?'disabled':''} onclick="fraudAttemptsPage++;fetchFraudAttempts()">Next →</button>`;
    document.getElementById('fraudAttemptsPagination').innerHTML = pagHtml;
  } catch(e) { document.getElementById('fraudAttemptsTable').innerHTML = '<p style="padding:20px;color:red">Load failed</p>'; }
}

async function clearFraudAttempts() {
  try {
    await api('/api/admin/fraud/attempts/clear', { method: 'DELETE' });
    toast('Attempt log cleared');
    fetchFraudAttempts();
  } catch(e) { toast(e.message, 'error'); }
}

async function loadFraudSettings() {
  const fc = document.getElementById('fraudContent');
  fc.innerHTML = '<p>Loading...</p>';
  try {
    const s = await api('/api/admin/settings');
    fc.innerHTML = `<form onsubmit="saveFraudSettings(event)">
      <div class="settings-section">
        <h3>Fraud Protection Features</h3>
        <p style="font-size:13px;color:#666;margin-bottom:16px">Toggle fraud protection features on or off. When a feature is disabled, the corresponding check is skipped during order placement.</p>
        <div class="fraud-toggles">
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="fraudEnabled" ${s.fraud_enabled==='1'?'checked':''}>
              <strong>Master Switch — Enable Fraud Protection</strong>
            </label>
            <small>Turning this off disables all fraud checks</small>
          </div>
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="fraudPhoneBlock" ${s.fraud_phone_block_enabled==='1'?'checked':''}>
              <strong>Phone Number Blocking</strong>
            </label>
            <small>Block orders from specific phone numbers</small>
          </div>
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="fraudIpBlock" ${s.fraud_ip_block_enabled==='1'?'checked':''}>
              <strong>IP Address Blocking</strong>
            </label>
            <small>Block orders from specific IP addresses</small>
          </div>
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="fraudFingerprintBlock" ${s.fraud_fingerprint_block_enabled==='1'?'checked':''}>
              <strong>Browser Fingerprint Blocking</strong>
            </label>
            <small>Block orders based on browser fingerprint</small>
          </div>
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="fraudDuplicateCheck" ${s.fraud_duplicate_check_enabled==='1'?'checked':''}>
              <strong>Duplicate Order Detection</strong>
            </label>
            <small>Prevent duplicate orders from same phone within a time window</small>
          </div>
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="fraudRateLimit" ${s.fraud_rate_limit_enabled==='1'?'checked':''}>
              <strong>Rate Limiting</strong>
            </label>
            <small>Limit the number of orders per phone/IP within a time period</small>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Fraud Thresholds</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Duplicate Window (minutes)</label>
            <input type="number" id="fraudDuplicateWindow" value="${s.fraud_duplicate_window_minutes||30}" min="1">
            <small style="color:#888">Time window to check for duplicate orders</small>
          </div>
          <div class="form-group">
            <label>Rate Limit — Max Orders Per Hour</label>
            <input type="number" id="fraudRateLimitMax" value="${s.fraud_rate_limit_max_per_hour||5}" min="1">
            <small style="color:#888">Maximum orders allowed per phone/IP per hour</small>
          </div>
          <div class="form-group">
            <label>Auto-Block After Failed Attempts</label>
            <input type="number" id="fraudAutoBlockThreshold" value="${s.fraud_auto_block_threshold||10}" min="1">
            <small style="color:#888">Auto-block after this many blocked attempts</small>
          </div>
          <div class="form-group">
            <label>Auto-Block Duration (hours)</label>
            <input type="number" id="fraudAutoBlockDuration" value="${s.fraud_auto_block_duration_hours||24}" min="1">
            <small style="color:#888">How long auto-blocks last</small>
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn-primary">Save Fraud Settings</button>
    </form>`;
  } catch(e) { fc.innerHTML = '<p style="color:red">Failed to load fraud settings</p>'; }
}

async function saveFraudSettings(e) {
  e.preventDefault();
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
      fraud_enabled: document.getElementById('fraudEnabled').checked ? '1' : '0',
      fraud_phone_block_enabled: document.getElementById('fraudPhoneBlock').checked ? '1' : '0',
      fraud_ip_block_enabled: document.getElementById('fraudIpBlock').checked ? '1' : '0',
      fraud_fingerprint_block_enabled: document.getElementById('fraudFingerprintBlock').checked ? '1' : '0',
      fraud_duplicate_check_enabled: document.getElementById('fraudDuplicateCheck').checked ? '1' : '0',
      fraud_rate_limit_enabled: document.getElementById('fraudRateLimit').checked ? '1' : '0',
      fraud_duplicate_window_minutes: document.getElementById('fraudDuplicateWindow').value,
      fraud_rate_limit_max_per_hour: document.getElementById('fraudRateLimitMax').value,
      fraud_auto_block_threshold: document.getElementById('fraudAutoBlockThreshold').value,
      fraud_auto_block_duration_hours: document.getElementById('fraudAutoBlockDuration').value,
    })});
    toast('Fraud settings saved');
  } catch(e) { toast(e.message, 'error'); }
}

async function loadFraudOtpSettings() {
  const fc = document.getElementById('fraudContent');
  fc.innerHTML = '<p>Loading...</p>';
  try {
    const s = await api('/api/admin/settings');
    fc.innerHTML = `<form onsubmit="saveOtpSettings(event)">
      <div class="settings-section">
        <h3>OTP Verification Settings</h3>
        <p style="font-size:13px;color:#666;margin-bottom:16px">Configure OTP (One-Time Password) verification for order placement. When enabled, customers must verify their phone number before placing an order.</p>
        <div class="fraud-toggles">
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="otpEnabled" ${s.otp_enabled==='1'?'checked':''}>
              <strong>Enable OTP Verification</strong>
            </label>
            <small>Require OTP verification for all orders</small>
          </div>
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="otpNewCustomersOnly" ${s.otp_new_customers_only==='1'?'checked':''}>
              <strong>New Customers Only</strong>
            </label>
            <small>Only require OTP for first-time customers</small>
          </div>
          <div class="fraud-toggle-item">
            <label class="fraud-toggle-label">
              <input type="checkbox" id="otpHighValueOnly" ${s.otp_high_value_only==='1'?'checked':''}>
              <strong>High-Value Orders Only</strong>
            </label>
            <small>Only require OTP for orders above the threshold</small>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>OTP Configuration</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>OTP Length</label>
            <select id="otpLength">
              <option value="4" ${s.otp_length==='4'?'selected':''}>4 digits</option>
              <option value="5" ${s.otp_length==='5'?'selected':''}>5 digits</option>
              <option value="6" ${(s.otp_length==='6'||!s.otp_length)?'selected':''}>6 digits</option>
            </select>
          </div>
          <div class="form-group">
            <label>OTP Expiry (seconds)</label>
            <input type="number" id="otpExpiry" value="${s.otp_expiry_seconds||300}" min="60" max="600">
            <small style="color:#888">How long the OTP code stays valid</small>
          </div>
          <div class="form-group">
            <label>Max OTP Attempts</label>
            <input type="number" id="otpMaxAttempts" value="${s.otp_max_attempts||3}" min="1" max="10">
            <small style="color:#888">Max wrong attempts before OTP is invalidated</small>
          </div>
          <div class="form-group">
            <label>Resend Cooldown (seconds)</label>
            <input type="number" id="otpResendCooldown" value="${s.otp_resend_cooldown||60}" min="30" max="300">
            <small style="color:#888">Minimum wait time before resending OTP</small>
          </div>
          <div class="form-group">
            <label>High-Value Order Threshold (TK)</label>
            <input type="number" id="otpHighValueThreshold" value="${s.otp_high_value_threshold||5000}" min="0">
            <small style="color:#888">OTP required for orders above this amount</small>
          </div>
          <div class="form-group">
            <label>SMS Provider</label>
            <select id="otpSmsProvider">
              <option value="bulksmsbd" ${s.otp_sms_provider==='bulksmsbd'?'selected':''}>BulkSMSBD</option>
              <option value="smsnet24" ${s.otp_sms_provider==='smsnet24'?'selected':''}>SMSNet24</option>
              <option value="custom" ${s.otp_sms_provider==='custom'?'selected':''}>Custom API</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>SMS API Configuration</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>SMS API Key</label>
            <input id="otpSmsApiKey" value="${s.otp_sms_api_key||''}" placeholder="Your SMS API key">
          </div>
          <div class="form-group">
            <label>SMS Sender ID</label>
            <input id="otpSmsSenderId" value="${s.otp_sms_sender_id||''}" placeholder="Sender ID / Mask">
          </div>
        </div>
        <div class="form-group">
          <label>OTP Message Template</label>
          <input id="otpMessageTemplate" value="${s.otp_message_template||'Your Rahnuma Shop verification code is: {OTP}. Valid for {MINUTES} minutes.'}" placeholder="Use {OTP} and {MINUTES} as placeholders">
          <small style="color:#888">Use {OTP} for the code and {MINUTES} for expiry time</small>
        </div>
      </div>

      <button type="submit" class="btn btn-primary">Save OTP Settings</button>
    </form>`;
  } catch(e) { fc.innerHTML = '<p style="color:red">Failed to load OTP settings</p>'; }
}

async function saveOtpSettings(e) {
  e.preventDefault();
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
      otp_enabled: document.getElementById('otpEnabled').checked ? '1' : '0',
      otp_new_customers_only: document.getElementById('otpNewCustomersOnly').checked ? '1' : '0',
      otp_high_value_only: document.getElementById('otpHighValueOnly').checked ? '1' : '0',
      otp_length: document.getElementById('otpLength').value,
      otp_expiry_seconds: document.getElementById('otpExpiry').value,
      otp_max_attempts: document.getElementById('otpMaxAttempts').value,
      otp_resend_cooldown: document.getElementById('otpResendCooldown').value,
      otp_high_value_threshold: document.getElementById('otpHighValueThreshold').value,
      otp_sms_provider: document.getElementById('otpSmsProvider').value,
      otp_sms_api_key: document.getElementById('otpSmsApiKey').value,
      otp_sms_sender_id: document.getElementById('otpSmsSenderId').value,
      otp_message_template: document.getElementById('otpMessageTemplate').value,
    })});
    toast('OTP settings saved');
  } catch(e) { toast(e.message, 'error'); }
}

async function loadFraudBlockMessage() {
  const fc = document.getElementById('fraudContent');
  fc.innerHTML = '<p>Loading...</p>';
  try {
    const s = await api('/api/admin/settings');
    fc.innerHTML = `<form onsubmit="saveBlockMessageSettings(event)">
      <div class="settings-section">
        <h3>Block Message Customization</h3>
        <p style="font-size:13px;color:#666;margin-bottom:16px">Customize the error messages shown to users when their order is blocked by the fraud protection system.</p>

        <div class="form-group">
          <label>Blocked Phone Message</label>
          <textarea id="blockMsgPhone" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${s.block_message_phone || 'Your phone number has been restricted from placing orders. Please contact support for assistance.'}</textarea>
          <small style="color:#888">Shown when a blocked phone number tries to order</small>
        </div>

        <div class="form-group">
          <label>Blocked IP Message</label>
          <textarea id="blockMsgIp" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${s.block_message_ip || 'Your connection has been restricted. Please contact support for assistance.'}</textarea>
          <small style="color:#888">Shown when a blocked IP address tries to order</small>
        </div>

        <div class="form-group">
          <label>Blocked Fingerprint Message</label>
          <textarea id="blockMsgFingerprint" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${s.block_message_fingerprint || 'Your device has been restricted from placing orders. Please contact support for assistance.'}</textarea>
          <small style="color:#888">Shown when a blocked browser fingerprint tries to order</small>
        </div>

        <div class="form-group">
          <label>Duplicate Order Message</label>
          <textarea id="blockMsgDuplicate" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${s.block_message_duplicate || 'A similar order was already placed recently. Please wait before placing another order.'}</textarea>
          <small style="color:#888">Shown when a duplicate order is detected</small>
        </div>

        <div class="form-group">
          <label>Rate Limit Message</label>
          <textarea id="blockMsgRateLimit" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${s.block_message_rate_limit || 'Too many orders placed in a short time. Please try again later.'}</textarea>
          <small style="color:#888">Shown when rate limit is exceeded</small>
        </div>

        <div class="form-group">
          <label>OTP Failed Message</label>
          <textarea id="blockMsgOtp" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${s.block_message_otp_failed || 'Phone verification failed. Please verify your phone number and try again.'}</textarea>
          <small style="color:#888">Shown when OTP verification fails</small>
        </div>

        <div class="form-group">
          <label>Generic Block Message</label>
          <textarea id="blockMsgGeneric" rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:inherit">${s.block_message_generic || 'Unable to process your order at this time. Please contact support for assistance.'}</textarea>
          <small style="color:#888">Fallback message when no specific message matches</small>
        </div>
      </div>

      <button type="submit" class="btn btn-primary">Save Block Messages</button>
    </form>`;
  } catch(e) { fc.innerHTML = '<p style="color:red">Failed to load block message settings</p>'; }
}

async function saveBlockMessageSettings(e) {
  e.preventDefault();
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
      block_message_phone: document.getElementById('blockMsgPhone').value,
      block_message_ip: document.getElementById('blockMsgIp').value,
      block_message_fingerprint: document.getElementById('blockMsgFingerprint').value,
      block_message_duplicate: document.getElementById('blockMsgDuplicate').value,
      block_message_rate_limit: document.getElementById('blockMsgRateLimit').value,
      block_message_otp_failed: document.getElementById('blockMsgOtp').value,
      block_message_generic: document.getElementById('blockMsgGeneric').value,
    })});
    toast('Block messages saved');
  } catch(e) { toast(e.message, 'error'); }
}

// ===== LANDING PAGES =====
let pagesPage = 1;
let pagesStatus = 'all';
let pagesSearch = '';

async function loadPages() {
  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <div class="search-bar">
          <input type="text" placeholder="Search pages..." id="pageSearchInput" onkeyup="if(event.key==='Enter'){pagesSearch=this.value;pagesPage=1;fetchPages()}">
          <select id="pageStatusFilter" onchange="pagesStatus=this.value;pagesPage=1;fetchPages()">
            <option value="all">All Pages</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="trash">Trash</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="showPageEditor()">+ New Page</button>
      </div>
      <div id="pagesTable"></div>
      <div class="pagination" id="pagesPagination"></div>
    </div>`;
  fetchPages();
}

async function fetchPages() {
  try {
    const params = new URLSearchParams({ page: pagesPage, limit: 20, status: pagesStatus, search: pagesSearch });
    const data = await api('/api/admin/pages?' + params);
    const pages = data.pages || [];

    document.getElementById('pagesTable').innerHTML = `<div class="table-responsive"><table><thead><tr><th>Title</th><th>URL Slug</th><th>Status</th><th>Views</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
    ${pages.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px">No pages found</td></tr>' :
      pages.map(p => `<tr>
        <td><strong>${escapeHtml(p.title)}</strong></td>
        <td><code>/p/${escapeHtml(p.slug)}</code></td>
        <td><span class="badge badge-${p.status === 'published' ? 'delivered' : p.status === 'draft' ? 'pending' : 'cancelled'}">${p.status}</span></td>
        <td>${p.views || 0}</td>
        <td>${p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-US') : '-'}</td>
        <td class="table-actions">
          <button class="btn btn-sm btn-ghost" onclick="showPageEditor(${p.id})">Edit</button>
          ${p.status === 'published' ? `<a href="/p/${p.slug}" target="_blank" class="btn btn-sm btn-ghost">View</a>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="duplicatePage(${p.id})">Copy</button>
          ${p.deleted_at ? `<button class="btn btn-sm btn-danger" onclick="if(confirm('Permanently delete this page?'))permanentDeletePage(${p.id})">Delete</button>` :
            `<button class="btn btn-sm btn-danger" onclick="trashPage(${p.id})">Trash</button>`}
        </td>
      </tr>`).join('')}
    </tbody></table></div>`;

    const totalPages = data.pages ? Math.ceil((data.total || 0) / 20) : 1;
    let pagHtml = `<button ${pagesPage<=1?'disabled':''} onclick="pagesPage--;fetchPages()">← Prev</button>`;
    pagHtml += `<span>Page ${pagesPage} / ${totalPages || 1}</span>`;
    pagHtml += `<button ${pagesPage>=totalPages?'disabled':''} onclick="pagesPage++;fetchPages()">Next →</button>`;
    document.getElementById('pagesPagination').innerHTML = pagHtml;
  } catch(e) { document.getElementById('pagesTable').innerHTML = '<p style="padding:20px;color:red">Failed to load pages: ' + e.message + '</p>'; console.error('Pages error:', e); }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const blockTypes = [
  { type: 'hero', label: 'Hero Section', icon: '🎯' },
  { type: 'text', label: 'Text Content', icon: '📝' },
  { type: 'image', label: 'Image', icon: '🖼' },
  { type: 'product', label: 'Product', icon: '🛍' },
  { type: 'cta', label: 'CTA Button', icon: '👆' },
  { type: 'faq', label: 'FAQ', icon: '❓' },
  { type: 'testimonial', label: 'Testimonial', icon: '💬' },
  { type: 'contact', label: 'Contact Info', icon: '📞' },
];

function getDefaultBlockData(type) {
  switch(type) {
    case 'hero': return { title: 'Welcome', subtitle: 'Your subtitle here', bg_color: '#1e3a5f', text_color: '#ffffff', cta_text: 'Order Now', cta_link: '#order' };
    case 'text': return { content: '<p>Enter your text content here.</p>' };
    case 'image': return { url: '', alt: '', caption: '' };
    case 'product': return { product_id: '', show_order_form: true, show_variants: true };
    case 'cta': return { text: 'Click Here', link: '#', color: '#2563eb', text_color: '#ffffff' };
    case 'faq': return { items: [{ question: 'Sample question?', answer: 'Sample answer.' }] };
    case 'testimonial': return { name: 'Customer Name', text: 'Great product!', rating: 5 };
    case 'contact': return { phone: '', whatsapp: '', messenger: '' };
    default: return {};
  }
}

function renderBlockEditor(block, index, totalBlocks) {
  const bt = blockTypes.find(b => b.type === block.type);
  const label = bt ? `${bt.icon} ${bt.label}` : block.type;

  let fieldsHtml = '';
  switch(block.type) {
    case 'hero':
      fieldsHtml = `
        <div class="form-grid">
          <div class="form-group"><label>Title</label><input value="${escapeHtml(block.data.title || '')}" onchange="updateBlockData(${index}, 'title', this.value)"></div>
          <div class="form-group"><label>Subtitle</label><input value="${escapeHtml(block.data.subtitle || '')}" onchange="updateBlockData(${index}, 'subtitle', this.value)"></div>
          <div class="form-group"><label>Background Color</label><input type="color" value="${block.data.bg_color || '#1e3a5f'}" onchange="updateBlockData(${index}, 'bg_color', this.value)"></div>
          <div class="form-group"><label>Text Color</label><input type="color" value="${block.data.text_color || '#ffffff'}" onchange="updateBlockData(${index}, 'text_color', this.value)"></div>
          <div class="form-group"><label>CTA Button Text</label><input value="${escapeHtml(block.data.cta_text || '')}" onchange="updateBlockData(${index}, 'cta_text', this.value)"></div>
          <div class="form-group"><label>CTA Button Link</label><input value="${escapeHtml(block.data.cta_link || '')}" onchange="updateBlockData(${index}, 'cta_link', this.value)"></div>
        </div>`;
      break;
    case 'text':
      fieldsHtml = `
        <div class="form-group"><label>Content (HTML)</label><textarea rows="5" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-family:monospace;font-size:13px" onchange="updateBlockData(${index}, 'content', this.value)">${escapeHtml(block.data.content || '')}</textarea></div>`;
      break;
    case 'image':
      fieldsHtml = `
        <div class="form-grid">
          <div class="form-group"><label>Image URL</label><input value="${escapeHtml(block.data.url || '')}" onchange="updateBlockData(${index}, 'url', this.value)"></div>
          <div class="form-group"><label>Alt Text</label><input value="${escapeHtml(block.data.alt || '')}" onchange="updateBlockData(${index}, 'alt', this.value)"></div>
        </div>
        <div class="form-group"><label>Caption</label><input value="${escapeHtml(block.data.caption || '')}" onchange="updateBlockData(${index}, 'caption', this.value)"></div>
        <div class="form-group"><label>Or Upload Image</label><input type="file" accept="image/*" onchange="uploadBlockImage(this, ${index})"></div>
        ${block.data.url ? `<img src="${block.data.url}" style="max-width:200px;max-height:120px;border-radius:8px;margin-top:8px">` : ''}`;
      break;
    case 'product':
      fieldsHtml = `
        <div class="form-grid">
          <div class="form-group"><label>Product</label><select id="blockProduct${index}" onchange="updateBlockData(${index}, 'product_id', this.value);loadBlockVariantPreview(${index}, this.value)"><option value="">Select Product</option></select></div>
          <div class="form-group" style="display:flex;flex-direction:column;gap:8px;justify-content:center">
            <label><input type="checkbox" ${block.data.show_order_form ? 'checked' : ''} onchange="updateBlockData(${index}, 'show_order_form', this.checked)"> Show COD Order Form</label>
            <label><input type="checkbox" ${block.data.show_variants !== false ? 'checked' : ''} onchange="updateBlockData(${index}, 'show_variants', this.checked)"> Show Variants (if available)</label>
          </div>
        </div>
        <div id="blockVariantPreview${index}" style="margin-top:8px"></div>
        <script>loadBlockProductOptions(${index}, '${block.data.product_id || ''}');if('${block.data.product_id}')loadBlockVariantPreview(${index},'${block.data.product_id}')<\/script>`;
      break;
    case 'cta':
      fieldsHtml = `
        <div class="form-grid">
          <div class="form-group"><label>Button Text</label><input value="${escapeHtml(block.data.text || '')}" onchange="updateBlockData(${index}, 'text', this.value)"></div>
          <div class="form-group"><label>Link URL</label><input value="${escapeHtml(block.data.link || '')}" onchange="updateBlockData(${index}, 'link', this.value)"></div>
          <div class="form-group"><label>Button Color</label><input type="color" value="${block.data.color || '#2563eb'}" onchange="updateBlockData(${index}, 'color', this.value)"></div>
          <div class="form-group"><label>Text Color</label><input type="color" value="${block.data.text_color || '#ffffff'}" onchange="updateBlockData(${index}, 'text_color', this.value)"></div>
        </div>`;
      break;
    case 'faq':
      const faqItems = block.data.items || [];
      fieldsHtml = `<div id="faqItems${index}">
        ${faqItems.map((item, fi) => `
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px">
            <div class="form-group"><label>Question</label><input value="${escapeHtml(item.question || '')}" onchange="updateFaqItem(${index}, ${fi}, 'question', this.value)"></div>
            <div class="form-group"><label>Answer</label><textarea rows="2" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-family:inherit" onchange="updateFaqItem(${index}, ${fi}, 'answer', this.value)">${escapeHtml(item.answer || '')}</textarea></div>
            <button type="button" class="btn btn-sm btn-danger" onclick="removeFaqItem(${index}, ${fi})">Remove</button>
          </div>
        `).join('')}
        </div>
        <button type="button" class="btn btn-sm btn-ghost" onclick="addFaqItem(${index})">+ Add FAQ Item</button>`;
      break;
    case 'testimonial':
      fieldsHtml = `
        <div class="form-grid">
          <div class="form-group"><label>Name</label><input value="${escapeHtml(block.data.name || '')}" onchange="updateBlockData(${index}, 'name', this.value)"></div>
          <div class="form-group"><label>Rating (1-5)</label><input type="number" min="1" max="5" value="${block.data.rating || 5}" onchange="updateBlockData(${index}, 'rating', Number(this.value))"></div>
        </div>
        <div class="form-group"><label>Testimonial Text</label><textarea rows="3" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-family:inherit" onchange="updateBlockData(${index}, 'text', this.value)">${escapeHtml(block.data.text || '')}</textarea></div>`;
      break;
    case 'contact':
      fieldsHtml = `
        <div class="form-grid">
          <div class="form-group"><label>Phone Number</label><input value="${escapeHtml(block.data.phone || '')}" onchange="updateBlockData(${index}, 'phone', this.value)"></div>
          <div class="form-group"><label>WhatsApp Link</label><input value="${escapeHtml(block.data.whatsapp || '')}" onchange="updateBlockData(${index}, 'whatsapp', this.value)" placeholder="https://wa.me/880..."></div>
          <div class="form-group"><label>Messenger Link</label><input value="${escapeHtml(block.data.messenger || '')}" onchange="updateBlockData(${index}, 'messenger', this.value)"></div>
        </div>`;
      break;
  }

  return `<div class="page-block" id="block-${index}" style="border:1.5px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:12px;background:#fafafa">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <strong style="font-size:14px">${label}</strong>
      <div style="display:flex;gap:6px">
        ${index > 0 ? `<button type="button" class="btn btn-sm btn-ghost" onclick="moveBlock(${index}, -1)" title="Move Up">↑</button>` : ''}
        ${index < totalBlocks - 1 ? `<button type="button" class="btn btn-sm btn-ghost" onclick="moveBlock(${index}, 1)" title="Move Down">↓</button>` : ''}
        <button type="button" class="btn btn-sm btn-danger" onclick="removeBlock(${index})" title="Remove Block">✕</button>
      </div>
    </div>
    ${fieldsHtml}
  </div>`;
}

let currentEditorBlocks = [];
let currentEditingPageId = null;

async function showPageEditor(id) {
  let pageData = { title: '', slug: '', status: 'draft', content: { blocks: [] }, seo_title: '', seo_description: '', custom_css: '' };
  let revisions = [];

  if (id) {
    try {
      const data = await api('/api/admin/pages/' + id);
      pageData = data.page;
      revisions = data.revisions || [];
      if (typeof pageData.content === 'string') {
        try { pageData.content = JSON.parse(pageData.content); } catch(e) { pageData.content = []; }
      }
      if (!pageData.content) pageData.content = [];
    } catch(e) { toast('Failed to load page: ' + e.message, 'error'); return; }
  }

  // content can be an array of blocks directly OR { blocks: [...] }
  let blocks = [];
  if (Array.isArray(pageData.content)) {
    blocks = pageData.content;
  } else if (pageData.content && Array.isArray(pageData.content.blocks)) {
    blocks = pageData.content.blocks;
  }
  currentEditorBlocks = [...blocks];
  currentEditingPageId = id || null;

  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);overflow-y:auto';
  modal.onclick = function(e) { if(e.target===this) { if(confirm('Close editor? Unsaved changes will be lost.')) this.remove(); } };

  modal.innerHTML = `<div class="admin-modal-content" style="max-width:900px;margin:20px auto;max-height:none">
    <div class="modal-header"><h2>${id ? 'Edit Page' : 'New Landing Page'}</h2><button class="modal-close" onclick="if(confirm('Close editor?'))this.closest('.admin-modal').remove()">&times;</button></div>

    <div style="display:grid;grid-template-columns:1fr 300px;gap:20px">
      <div>
        <div class="form-group"><label>Page Title</label><input id="lpTitle" value="${escapeHtml(pageData.title)}" required oninput="if(!document.getElementById('lpSlugManual').checked)document.getElementById('lpSlug').value=generateSlug(this.value)"></div>
        <div class="form-group"><label>URL Slug <small>(<input type="checkbox" id="lpSlugManual"> custom)</small></label><input id="lpSlug" value="${escapeHtml(pageData.slug)}" placeholder="page-url-slug"></div>

        <h3 style="margin:20px 0 12px;font-size:16px">Page Content Blocks</h3>
        <div id="blocksContainer"></div>

        <div style="margin-top:12px;position:relative">
          <button type="button" class="btn btn-ghost" onclick="document.getElementById('addBlockDropdown').style.display=document.getElementById('addBlockDropdown').style.display==='block'?'none':'block'">+ Add Block</button>
          <div id="addBlockDropdown" style="display:none;position:absolute;top:100%;left:0;background:white;border:1.5px solid #e5e7eb;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.15);padding:8px;z-index:100;min-width:220px">
            ${blockTypes.map(bt => `<div style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:14px" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''" onclick="addBlock('${bt.type}');document.getElementById('addBlockDropdown').style.display='none'">${bt.icon} ${bt.label}</div>`).join('')}
          </div>
        </div>
      </div>

      <div style="border-left:1.5px solid #e5e7eb;padding-left:20px">
        <div class="form-group"><label>Status</label>
          <select id="lpStatus">
            <option value="draft" ${pageData.status === 'draft' ? 'selected' : ''}>Draft</option>
            <option value="published" ${pageData.status === 'published' ? 'selected' : ''}>Published</option>
          </select>
        </div>

        <h4 style="margin:16px 0 8px">SEO Settings</h4>
        <div class="form-group"><label>SEO Title</label><input id="lpSeoTitle" value="${escapeHtml(pageData.seo_title || '')}"></div>
        <div class="form-group"><label>SEO Description</label><textarea id="lpSeoDesc" rows="3" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-family:inherit">${escapeHtml(pageData.seo_description || '')}</textarea></div>

        <h4 style="margin:16px 0 8px">Custom CSS</h4>
        <div class="form-group"><textarea id="lpCustomCss" rows="4" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-family:monospace;font-size:12px">${escapeHtml(pageData.custom_css || '')}</textarea></div>

        ${revisions.length > 0 ? `
          <h4 style="margin:16px 0 8px">Revisions (${revisions.length})</h4>
          <div style="max-height:200px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;padding:8px">
            ${revisions.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:12px">
              <span>${new Date(r.created_at).toLocaleString('en-US')}</span>
              <button class="btn btn-sm btn-ghost" onclick="restoreRevision(${id}, ${r.id})">Restore</button>
            </div>`).join('')}
          </div>
        ` : ''}

        <div style="margin-top:20px;display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary" onclick="saveLandingPage(${id || 'null'})">Save Page</button>
          ${id ? `<a href="/p/${pageData.slug}" target="_blank" class="btn btn-ghost" style="text-align:center">Preview Page</a>` : ''}
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);

  renderBlocks();

  // Load product options for any product blocks
  setTimeout(() => {
    currentEditorBlocks.forEach((block, idx) => {
      if (block.type === 'product') {
        loadBlockProductOptions(idx, block.data.product_id || '');
      }
    });
  }, 100);
}

function renderBlocks() {
  const container = document.getElementById('blocksContainer');
  if (!container) return;
  if (currentEditorBlocks.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#999;border:2px dashed #e5e7eb;border-radius:10px">No blocks yet. Click "Add Block" to start building your page.</div>';
    return;
  }
  container.innerHTML = currentEditorBlocks.map((block, i) => renderBlockEditor(block, i, currentEditorBlocks.length)).join('');
}

function addBlock(type) {
  currentEditorBlocks.push({ type, data: getDefaultBlockData(type) });
  renderBlocks();
  if (type === 'product') {
    setTimeout(() => loadBlockProductOptions(currentEditorBlocks.length - 1, ''), 100);
  }
}

function removeBlock(index) {
  if (!confirm('Remove this block?')) return;
  currentEditorBlocks.splice(index, 1);
  renderBlocks();
}

function moveBlock(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= currentEditorBlocks.length) return;
  const temp = currentEditorBlocks[index];
  currentEditorBlocks[index] = currentEditorBlocks[newIndex];
  currentEditorBlocks[newIndex] = temp;
  renderBlocks();
}

function updateBlockData(index, key, value) {
  if (currentEditorBlocks[index]) {
    currentEditorBlocks[index].data[key] = value;
  }
}

function updateFaqItem(blockIndex, faqIndex, key, value) {
  if (currentEditorBlocks[blockIndex] && currentEditorBlocks[blockIndex].data.items) {
    currentEditorBlocks[blockIndex].data.items[faqIndex][key] = value;
  }
}

function addFaqItem(blockIndex) {
  if (!currentEditorBlocks[blockIndex].data.items) currentEditorBlocks[blockIndex].data.items = [];
  currentEditorBlocks[blockIndex].data.items.push({ question: '', answer: '' });
  renderBlocks();
}

function removeFaqItem(blockIndex, faqIndex) {
  currentEditorBlocks[blockIndex].data.items.splice(faqIndex, 1);
  renderBlocks();
}

async function uploadBlockImage(input, blockIndex) {
  if (!input.files[0]) return;
  const form = new FormData();
  form.append('image', input.files[0]);
  try {
    const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (data.url) {
      updateBlockData(blockIndex, 'url', data.url);
      renderBlocks();
    }
  } catch(e) { toast('Upload failed', 'error'); }
}

let _productListCache = null;
async function loadBlockProductOptions(blockIndex, selectedId) {
  const sel = document.getElementById('blockProduct' + blockIndex);
  if (!sel) return;
  try {
    if (!_productListCache) {
      _productListCache = await api('/api/admin/products/list');
    }
    const products = _productListCache;
    sel.innerHTML = '<option value="">Select Product</option>' + products.map(p =>
      `<option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${p.name} (TK ${p.sale_price || p.price})${p.variant_count > 0 ? ' ['+p.variant_count+' variants]' : ''}</option>`
    ).join('');
  } catch(e) {}
}

async function loadBlockVariantPreview(blockIndex, productId) {
  const el = document.getElementById('blockVariantPreview' + blockIndex);
  if (!el || !productId) { if(el) el.innerHTML = ''; return; }
  try {
    const variants = await api('/api/products/' + productId + '/variants');
    if (variants.length === 0) {
      el.innerHTML = '<small style="color:#999">No variants for this product</small>';
      return;
    }
    const grouped = {};
    variants.forEach(v => { if (!grouped[v.name]) grouped[v.name] = []; grouped[v.name].push(v); });
    let html = '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;font-size:13px"><strong>Variants available:</strong><br>';
    for (const [name, vals] of Object.entries(grouped)) {
      html += `<span style="font-weight:600">${name}:</span> ${vals.map(v => `<span style="background:#e0f2e0;padding:2px 8px;border-radius:4px;margin:2px">${v.value}${v.price_adjustment ? ' (+'+v.price_adjustment+'TK)' : ''}</span>`).join(' ')} <br>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) { el.innerHTML = ''; }
}

async function saveLandingPage(id) {
  const title = document.getElementById('lpTitle').value;
  const slug = document.getElementById('lpSlug').value;
  const status = document.getElementById('lpStatus').value;
  const seo_title = document.getElementById('lpSeoTitle').value;
  const seo_description = document.getElementById('lpSeoDesc').value;
  const custom_css = document.getElementById('lpCustomCss').value;

  if (!title) { toast('Title is required', 'error'); return; }

  const body = {
    title,
    slug: slug || generateSlug(title),
    content: currentEditorBlocks,
    seo_title,
    seo_description,
    custom_css
  };

  try {
    if (id) {
      await api('/api/admin/pages/' + id, { method: 'PUT', body: JSON.stringify(body) });
      // Update status separately if needed
      const currentStatus = document.getElementById('lpStatus').value;
      await api('/api/admin/pages/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status: currentStatus }) });
      toast('Page updated');
    } else {
      body.status = status;
      await api('/api/admin/pages', { method: 'POST', body: JSON.stringify(body) });
      toast('Page created');
    }
    document.querySelector('.admin-modal').remove();
    _productListCache = null;
    fetchPages();
  } catch(e) { toast(e.message, 'error'); }
}

async function duplicatePage(id) {
  try {
    await api('/api/admin/pages/' + id + '/duplicate', { method: 'POST' });
    toast('Page duplicated');
    fetchPages();
  } catch(e) { toast(e.message, 'error'); }
}

async function trashPage(id) {
  if (!confirm('Move this page to trash?')) return;
  try {
    await api('/api/admin/pages/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status: 'trash' }) });
    toast('Page moved to trash');
    fetchPages();
  } catch(e) { toast(e.message, 'error'); }
}

async function permanentDeletePage(id) {
  try {
    await api('/api/admin/pages/' + id, { method: 'DELETE' });
    toast('Page permanently deleted');
    fetchPages();
  } catch(e) { toast(e.message, 'error'); }
}

async function restoreRevision(pageId, revId) {
  if (!confirm('Restore this revision? Current content will be saved as a new revision.')) return;
  try {
    const result = await api('/api/admin/pages/' + pageId + '/revisions/' + revId + '/restore', { method: 'POST' });
    toast('Revision restored');
    document.querySelector('.admin-modal').remove();
    showPageEditor(pageId);
  } catch(e) { toast(e.message, 'error'); }
}

// ===== AD PERFORMANCE =====

async function loadAdsPage() {
  const c = document.getElementById('pageContent');
  const today = new Date().toISOString().split('T')[0];
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  c.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <div style="display:flex;gap:8px;align-items:center">
        <label>From:</label><input type="date" id="adDateFrom" value="${thirtyAgo}" onchange="fetchAdsData()">
        <label>To:</label><input type="date" id="adDateTo" value="${today}" onchange="fetchAdsData()">
      </div>
      <button class="btn btn-primary" onclick="showAddAdSpend()">+ Add Daily Ad Spend</button>
    </div>
    <div id="adsContent"><p>Loading...</p></div>`;
  fetchAdsData();
}

async function fetchAdsData() {
  const from = document.getElementById('adDateFrom').value;
  const to = document.getElementById('adDateTo').value;
  const container = document.getElementById('adsContent');

  try {
    const d = await api(`/api/admin/ads/dashboard?from=${from}&to=${to}`);
    const s = d.summary;

    container.innerHTML = `
    <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="font-size:15px">USD to BDT Rate</h3>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:24px;font-weight:700;color:var(--green-mid)">1 USD = ৳${d.rate}</span>
          <button class="btn btn-sm btn-ghost" onclick="changeUsdRate()">Change</button>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="border-left:4px solid #dc2626"><div class="label">Total Ad Spend (USD)</div><div class="value" style="color:#dc2626">$${s.totalSpendUSD}</div></div>
      <div class="stat-card" style="border-left:4px solid #dc2626"><div class="label">Total Ad Spend (BDT)</div><div class="value" style="color:#dc2626">৳${s.totalSpendBDT}</div></div>
      <div class="stat-card" style="border-left:4px solid #3b82f6"><div class="label">Revenue</div><div class="value" style="color:#3b82f6">৳${s.revenue}</div><div class="sub">${s.orders} orders</div></div>
      <div class="stat-card" style="border-left:4px solid #22c55e"><div class="label">Delivered Revenue</div><div class="value" style="color:#22c55e">৳${s.delivered}</div></div>
      <div class="stat-card" style="border-left:4px solid #f59e0b"><div class="label">Cost of Goods</div><div class="value">৳${s.costOfGoods}</div></div>
      <div class="stat-card" style="border-left:4px solid #8b5cf6"><div class="label">Other Expenses</div><div class="value">৳${s.otherExpenses}</div></div>
    </div>

    <div class="stats-grid">
      <div class="stat-card highlight"><div class="label">Gross Profit (Revenue - COGS)</div><div class="value" style="color:${s.grossProfit>=0?'#4ade80':'#fca5a5'}">৳${s.grossProfit}</div></div>
      <div class="stat-card" style="background:${s.netProfit>=0?'#166534':'#991b1b'};color:#fff"><div class="label" style="color:rgba(255,255,255,0.7)">Net Profit (After Ads + Expenses)</div><div class="value" style="color:${s.netProfit>=0?'#4ade80':'#fca5a5'};font-size:28px">৳${s.netProfit}</div></div>
      <div class="stat-card"><div class="label">ROAS (Return on Ad Spend)</div><div class="value" style="color:${parseFloat(s.roas)>=2?'#16a34a':'#dc2626'}">${s.roas}x</div><div class="sub">${parseFloat(s.roas)>=2?'Good':'Needs improvement'}</div></div>
      <div class="stat-card"><div class="label">Cost Per Order</div><div class="value">৳${s.costPerOrder}</div></div>
    </div>

    <div class="table-wrap" style="margin-top:16px">
      <div class="table-header"><h2>Daily Ad Spend Log</h2></div>
      <table><thead><tr><th>Date</th><th>Platform</th><th>Spend (USD)</th><th>Spend (BDT)</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Purchases</th><th>Notes</th><th>Action</th></tr></thead><tbody>
      ${d.adSpends.length === 0 ? '<tr><td colspan="10" style="text-align:center;color:#999;padding:20px">No ad spend data yet. Click "+ Add Daily Ad Spend" to start tracking.</td></tr>' :
        d.adSpends.map(a => {
          const ctr = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) + '%' : '-';
          return `<tr>
            <td><strong>${a.date}</strong></td>
            <td>${a.platform || 'Facebook'}</td>
            <td style="color:#dc2626;font-weight:600">$${parseFloat(a.spend_usd).toFixed(2)}</td>
            <td style="color:#dc2626">৳${Math.round(a.spend_bdt)}</td>
            <td>${a.impressions || 0}</td>
            <td>${a.clicks || 0}</td>
            <td>${ctr}</td>
            <td>${a.purchases || 0}</td>
            <td>${a.notes || '-'}</td>
            <td><button class="btn btn-sm btn-danger" onclick="if(confirm('Delete?'))deleteAdSpend(${a.id})">✕</button></td>
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
  } catch(e) { container.innerHTML = '<p style="color:red">Failed to load: ' + e.message + '</p>'; }
}

function showAddAdSpend() {
  const today = new Date().toISOString().split('T')[0];
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.onclick = function(e) { if(e.target===this) this.remove(); };
  modal.innerHTML = `<div class="admin-modal-content" style="max-width:450px">
    <div class="modal-header"><h2>Add Daily Ad Spend</h2><button class="modal-close" onclick="this.closest('.admin-modal').remove()">&times;</button></div>
    <form onsubmit="saveAdSpend(event)">
      <div class="form-group"><label>Date</label><input type="date" id="adDate" value="${today}" required></div>
      <div class="form-group"><label>Platform</label><select id="adPlatform"><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="google">Google</option><option value="tiktok">TikTok</option><option value="other">Other</option></select></div>
      <div class="form-group"><label>Spend (USD)</label><input type="number" step="0.01" id="adSpendUsd" required placeholder="e.g. 15.50"></div>
      <div class="form-grid">
        <div class="form-group"><label>Impressions</label><input type="number" id="adImpressions" value="0"></div>
        <div class="form-group"><label>Clicks</label><input type="number" id="adClicks" value="0"></div>
      </div>
      <div class="form-group"><label>Purchases (from ads)</label><input type="number" id="adPurchases" value="0"></div>
      <div class="form-group"><label>Notes</label><input id="adNotes" placeholder="Campaign name, ad set, etc."></div>
      <button type="submit" class="btn btn-primary">Save Ad Spend</button>
    </form>
  </div>`;
  document.body.appendChild(modal);
}

async function saveAdSpend(e) {
  e.preventDefault();
  try {
    await api('/api/admin/ads/spend', { method: 'POST', body: JSON.stringify({
      date: document.getElementById('adDate').value,
      platform: document.getElementById('adPlatform').value,
      spend_usd: parseFloat(document.getElementById('adSpendUsd').value),
      impressions: parseInt(document.getElementById('adImpressions').value) || 0,
      clicks: parseInt(document.getElementById('adClicks').value) || 0,
      purchases: parseInt(document.getElementById('adPurchases').value) || 0,
      notes: document.getElementById('adNotes').value
    })});
    document.querySelector('.admin-modal').remove();
    toast('Ad spend saved');
    fetchAdsData();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteAdSpend(id) {
  try {
    await api('/api/admin/ads/spend/' + id, { method: 'DELETE' });
    toast('Deleted');
    fetchAdsData();
  } catch(e) { toast(e.message, 'error'); }
}

async function changeUsdRate() {
  const newRate = prompt('Enter new USD to BDT rate:', '122');
  if (!newRate) return;
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ usd_to_bdt_rate: newRate }) });
    toast('Rate updated to ৳' + newRate);
    fetchAdsData();
  } catch(e) { toast(e.message, 'error'); }
}

// ===== SETTINGS =====
async function loadSettings() {
  const c = document.getElementById('pageContent');
  try {
    const s = await api('/api/admin/settings');
    c.innerHTML = `<form onsubmit="saveSettings(event)">
      <div class="settings-section">
        <h3>Shop Information</h3>
        <div class="form-grid">
          <div class="form-group"><label>Shop Name (Bengali)</label><input id="sShopName" value="${s.shop_name||''}"></div>
          <div class="form-group"><label>Shop Name (English)</label><input id="sShopNameEn" value="${s.shop_name_en||''}"></div>
          <div class="form-group"><label>Phone</label><input id="sPhone" value="${s.shop_phone||''}"></div>
          <div class="form-group"><label>Email</label><input id="sEmail" value="${s.shop_email||''}"></div>
        </div>
        <div class="form-group"><label>Address</label><input id="sAddress" value="${s.shop_address||''}"></div>
      </div>

      <div class="settings-section">
        <h3>Delivery Charges</h3>
        <div class="form-grid">
          <div class="form-group"><label>Inside Dhaka (TK)</label><input type="number" id="sShipIn" value="${s.shipping_inside_dhaka||60}"></div>
          <div class="form-group"><label>Outside Dhaka (TK)</label><input type="number" id="sShipOut" value="${s.shipping_outside_dhaka||120}"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Payment Methods</h3>
        <div class="form-grid">
          <div class="form-group"><label><input type="checkbox" id="sCod" ${s.cod_enabled==='1'?'checked':''}> Cash on Delivery</label></div>
          <div></div>
          <div class="form-group"><label><input type="checkbox" id="sBkash" ${s.bkash_enabled==='1'?'checked':''}> bKash</label><input id="sBkashNum" value="${s.bkash_number||''}" placeholder="bKash number" style="margin-top:6px"></div>
          <div class="form-group"><label><input type="checkbox" id="sNagad" ${s.nagad_enabled==='1'?'checked':''}> Nagad</label><input id="sNagadNum" value="${s.nagad_number||''}" placeholder="Nagad number" style="margin-top:6px"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Social Media</h3>
        <div class="form-grid">
          <div class="form-group"><label>WhatsApp Number</label><input id="sWhatsapp" value="${s.whatsapp_number||''}"></div>
          <div class="form-group"><label>Messenger Link</label><input id="sMessenger" value="${s.messenger_link||''}"></div>
          <div class="form-group"><label>Facebook Page URL</label><input id="sFbPage" value="${s.facebook_page||''}"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Steadfast Courier API</h3>
        <p style="font-size:13px;color:#666;margin-bottom:16px">Steadfast courier integration — auto order dispatch, status updates, accounting.</p>
        <div class="form-grid">
          <div class="form-group">
            <label>API Key</label>
            <input id="sSteadfastKey" value="${s.steadfast_api_key||''}" placeholder="Steadfast API Key">
            <small style="color:#888">Steadfast Portal > Settings > API</small>
          </div>
          <div class="form-group">
            <label>Secret Key</label>
            <input id="sSteadfastSecret" type="password" value="${s.steadfast_secret_key||''}" placeholder="Steadfast Secret Key">
          </div>
          <div class="form-group">
            <label>Base URL</label>
            <input id="sSteadfastUrl" value="${s.steadfast_base_url||'https://portal.packzy.com/api/v1'}">
          </div>
        </div>
        <div style="margin-top:12px"><button type="button" class="btn btn-ghost" onclick="checkCourierBalance()">Check Balance</button> <span id="courierBalance"></span></div>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-top:12px;font-size:13px">
          <strong>Webhook URL (set this in Steadfast):</strong><br>
          <code style="background:#e0f2e0;padding:4px 8px;border-radius:4px">${window.location.origin}/api/webhook/steadfast</code>
          <br><br>
          <strong>Automation Flow:</strong><br>
          - Order > Send to courier (1-click)<br>
          - On delivery > Auto status update + payment marked paid<br>
          - Delivery charge > Auto added to expenses<br>
          - On cancel > Auto stock restore + charge added to expenses
        </div>
      </div>

      <div class="settings-section">
        <h3>Pathao Courier API</h3>
        <p style="font-size:13px;color:#666;margin-bottom:16px">Pathao courier integration — create orders, track shipments.</p>
        <div class="form-grid">
          <div class="form-group"><label>Client ID</label><input id="sPathaoClientId" value="${s.pathao_client_id||''}" placeholder="Pathao Client ID"></div>
          <div class="form-group"><label>Client Secret</label><input id="sPathaoClientSecret" type="password" value="${s.pathao_client_secret||''}" placeholder="Pathao Client Secret"></div>
          <div class="form-group"><label>Username (Email)</label><input id="sPathaoUsername" value="${s.pathao_username||''}" placeholder="Pathao account email"></div>
          <div class="form-group"><label>Password</label><input id="sPathaoPassword" type="password" value="${s.pathao_password||''}" placeholder="Pathao account password"></div>
          <div class="form-group"><label>Store ID</label><input id="sPathaoStoreId" value="${s.pathao_store_id||''}" placeholder="Store ID"><small style="color:#888">Get from Pathao merchant portal</small></div>
          <div class="form-group"><label>Default City ID</label><input id="sPathaoCityId" value="${s.pathao_city_id||'1'}" placeholder="1 = Dhaka"></div>
          <div class="form-group"><label>Default Zone ID</label><input id="sPathaoZoneId" value="${s.pathao_zone_id||'1'}" placeholder="Zone ID"></div>
          <div class="form-group"><label>Base URL</label><input id="sPathaoBaseUrl" value="${s.pathao_base_url||'https://hermes.pathao.com'}"></div>
        </div>
        <div style="margin-top:12px"><button type="button" class="btn btn-ghost" onclick="checkPathaoStores()">Get My Stores</button> <span id="pathaoStoreInfo"></span></div>
      </div>

      <div class="settings-section">
        <h3>RedX Courier API</h3>
        <p style="font-size:13px;color:#666;margin-bottom:16px">RedX courier integration — create parcels, track deliveries.</p>
        <div class="form-grid">
          <div class="form-group"><label>API Access Token</label><input id="sRedxApiKey" type="password" value="${s.redx_api_key||''}" placeholder="RedX API Access Token"><small style="color:#888">RedX merchant portal > API settings</small></div>
          <div class="form-group"><label>Base URL</label><input id="sRedxBaseUrl" value="${s.redx_base_url||'https://openapi.redx.com.bd'}"></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>🔍 BD Courier — Customer Risk Check</h3>
        <p style="font-size:13px;color:#666;margin-bottom:16px">কাস্টমারের ডেলিভারি ইতিহাস ও ফ্রড রিপোর্ট চেক করুন। Order detail থেকে "Customer Check" বাটন দিয়ে ব্যবহার করুন।</p>
        <div class="form-grid">
          <div class="form-group"><label>API Key</label><input id="sBdcourierApiKey" type="password" value="${s.bdcourier_api_key||''}" placeholder="BD Courier API Key"><small style="color:#888">api.bdcourier.com Bearer token</small></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Facebook Pixel & Conversion API</h3>
        <p style="font-size:13px;color:#666;margin-bottom:16px">Client-side Pixel + Server-side Conversion API (CAPI) both work. Deduplication via Event ID prevents duplicate events.</p>
        <div class="form-grid">
          <div class="form-group">
            <label>Facebook Pixel ID</label>
            <input id="sFbPixelId" value="${s.facebook_pixel_id||''}" placeholder="e.g. 123456789012345">
            <small style="color:#888">Events Manager > Data Sources > Pixel ID</small>
          </div>
          <div class="form-group">
            <label>Conversion API Access Token</label>
            <input id="sFbAccessToken" type="password" value="${s.facebook_access_token||''}" placeholder="EAAxxxxxxx...">
            <small style="color:#888">Events Manager > Settings > Generate Access Token</small>
          </div>
          <div class="form-group">
            <label>Test Event Code (optional)</label>
            <input id="sFbTestCode" value="${s.facebook_test_event_code||''}" placeholder="TEST12345">
            <small style="color:#888">Use during testing, leave empty for production</small>
          </div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-top:12px;font-size:13px">
          <strong>Tracking Events:</strong><br>
          - PageView — Every page visit<br>
          - ViewContent — When viewing a product<br>
          - AddToCart — When adding to cart<br>
          - InitiateCheckout — When visiting checkout page<br>
          - Purchase — Order completed (server-side + client)
        </div>
      </div>

      <div class="settings-section">
        <h3>Change Password</h3>
        <div class="form-grid">
          <div class="form-group"><label>Current Password</label><input type="password" id="sCurPass"></div>
          <div class="form-group"><label>New Password</label><input type="password" id="sNewPass"></div>
        </div>
        <button type="button" class="btn btn-ghost" onclick="changePassword()">Change Password</button>
      </div>

      <button type="submit" class="btn btn-primary" style="margin-top:8px">Save Settings</button>
    </form>`;
  } catch(e) { c.innerHTML = '<p style="color:red">Load failed</p>'; }
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
      steadfast_api_key: document.getElementById('sSteadfastKey').value,
      steadfast_secret_key: document.getElementById('sSteadfastSecret').value,
      steadfast_base_url: document.getElementById('sSteadfastUrl').value,
      pathao_client_id: document.getElementById('sPathaoClientId').value,
      pathao_client_secret: document.getElementById('sPathaoClientSecret').value,
      pathao_username: document.getElementById('sPathaoUsername').value,
      pathao_password: document.getElementById('sPathaoPassword').value,
      pathao_store_id: document.getElementById('sPathaoStoreId').value,
      pathao_city_id: document.getElementById('sPathaoCityId').value,
      pathao_zone_id: document.getElementById('sPathaoZoneId').value,
      pathao_base_url: document.getElementById('sPathaoBaseUrl').value,
      redx_api_key: document.getElementById('sRedxApiKey').value,
      redx_base_url: document.getElementById('sRedxBaseUrl').value,
      bdcourier_api_key: document.getElementById('sBdcourierApiKey').value,
      facebook_pixel_id: document.getElementById('sFbPixelId').value,
      facebook_access_token: document.getElementById('sFbAccessToken').value,
      facebook_test_event_code: document.getElementById('sFbTestCode').value,
    })});
    toast('Settings saved');
  } catch(e) { toast(e.message, 'error'); }
}

async function changePassword() {
  const cur = document.getElementById('sCurPass').value;
  const nw = document.getElementById('sNewPass').value;
  if (!cur || !nw) { toast('Please fill both fields', 'error'); return; }
  try {
    await api('/api/admin/password', { method: 'PUT', body: JSON.stringify({ current_password: cur, new_password: nw }) });
    toast('Password changed');
    document.getElementById('sCurPass').value = '';
    document.getElementById('sNewPass').value = '';
  } catch(e) { toast(e.message, 'error'); }
}

async function checkPathaoStores() {
  const el = document.getElementById('pathaoStoreInfo');
  el.textContent = 'Loading...';
  try {
    const data = await api('/api/admin/courier/pathao-stores');
    const stores = data.data || [];
    el.innerHTML = stores.map(s => `<span style="background:#e0f2fe;padding:2px 8px;border-radius:4px;margin-right:6px;font-size:12px">${s.store_name} (ID: ${s.store_id})</span>`).join('') || 'No stores found';
  } catch(e) { el.innerHTML = `<span style="color:#dc2626">${e.message}</span>`; }
}

async function checkCourierBalance() {
  const el = document.getElementById('courierBalance');
  el.textContent = 'Checking...';
  try {
    const data = await api('/api/admin/courier/balance');
    el.innerHTML = `<strong style="color:#16a34a">TK ${data.current_balance}</strong>`;
  } catch(e) { el.innerHTML = `<span style="color:#dc2626">${e.message}</span>`; }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadDashboard();
});
