// ===== CART MANAGEMENT =====
let cart = JSON.parse(localStorage.getItem('rahnuma_cart') || '[]');
let shopSettings = {};
let selectedHadiya = 2001;
let selectedPayment = 'cod';
let appliedCoupon = null;

function saveCart() {
  localStorage.setItem('rahnuma_cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const els = document.querySelectorAll('#cartCount, .cart-count-mobile');
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  els.forEach(el => { if (el) el.textContent = count; });
}

function addToCart(product) {
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ id: product.id, name: product.name_bn || product.name, price: product.sale_price || product.price, image: product.image, quantity: 1 });
  }
  saveCart();
  renderCart();
  showToast('কার্টে যোগ হয়েছে!');
  fbAddToCart(product);
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  renderCart();
}

function updateQuantity(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) { removeFromCart(id); return; }
  saveCart();
  renderCart();
}

function renderCart() {
  const body = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');
  if (!body) return;

  if (cart.length === 0) {
    body.innerHTML = '<div class="cart-empty"><p style="font-size:48px;margin-bottom:12px">🛒</p><p>কার্ট খালি</p></div>';
    if (footer) footer.style.display = 'none';
    return;
  }

  let html = '';
  let subtotal = 0;
  cart.forEach(item => {
    subtotal += item.price * item.quantity;
    const imgHtml = item.image && !item.image.includes('undefined')
      ? `<img src="${item.image}" alt="">`
      : '📦';
    html += `<div class="cart-item">
      <div class="cart-item-img">${imgHtml}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">৳${item.price}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.id})">✕</button>
    </div>`;
  });
  body.innerHTML = html;

  if (footer) {
    footer.style.display = 'block';
    document.getElementById('cartSubtotal').textContent = '৳' + subtotal;
  }
}

function openCart() {
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartSidebar').classList.add('open');
  renderCart();
}

function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartSidebar').classList.remove('open');
}

// ===== NAV =====
function toggleNav() {
  document.getElementById('navLinks').classList.toggle('open');
}

// ===== PRODUCTS =====
async function loadProducts(category) {
  try {
    let url = '/api/products?limit=50';
    if (category && category !== 'all') url += '&category=' + category;
    const res = await fetch(url);
    const data = await res.json();
    renderProducts(data.products);
  } catch(e) { console.error(e); }
}

function renderProducts(products) {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:#999;padding:40px 0">কোনো পণ্য পাওয়া যায়নি</p>';
    return;
  }

  grid.innerHTML = products.map(p => {
    const price = p.sale_price || p.price;
    const hasDiscount = p.sale_price && p.sale_price < p.price;
    const discountPercent = hasDiscount ? Math.round((1 - p.sale_price / p.price) * 100) : 0;
    const imgHtml = p.image && !p.image.includes('undefined')
      ? `<img src="${p.image}" alt="${p.name_bn || p.name}">`
      : '📦';
    const outOfStock = p.stock <= 0;

    return `<div class="product-card" onclick="showProduct('${p.slug}')">
      <div class="product-img">${imgHtml}</div>
      <div class="product-info">
        <div class="product-cat">${p.category_name_bn || p.category_name || ''}</div>
        <div class="product-name">${p.name_bn || p.name}</div>
        <div class="product-price">
          <span class="current">৳${price}</span>
          ${hasDiscount ? `<span class="original">৳${p.price}</span><span class="badge">${discountPercent}% ছাড়</span>` : ''}
        </div>
        <div class="product-actions">
          ${outOfStock
            ? '<button class="add-cart-btn stock-out" disabled>স্টক শেষ</button>'
            : `<button class="add-cart-btn" onclick="event.stopPropagation();addToCart(${JSON.stringify({id:p.id,name:p.name,name_bn:p.name_bn,price:price,image:p.image}).replace(/"/g,'&quot;')})">🛒 কার্টে যোগ করুন</button>`
          }
        </div>
      </div>
    </div>`;
  }).join('');
}

async function showProduct(slug) {
  try {
    const res = await fetch('/api/products/' + slug);
    const p = await res.json();
    const modal = document.getElementById('productModal');
    const content = document.getElementById('productModalContent');

    const price = p.sale_price || p.price;
    const hasDiscount = p.sale_price && p.sale_price < p.price;
    const imgHtml = p.image && !p.image.includes('undefined')
      ? `<img src="${p.image}" alt="" style="width:100%;max-height:300px;object-fit:cover;border-radius:12px">`
      : '<div style="font-size:100px;text-align:center;padding:40px 0">📦</div>';

    content.innerHTML = `
      <button onclick="document.getElementById('productModal').classList.remove('open')" style="float:right;background:none;border:none;font-size:24px;cursor:pointer">&times;</button>
      ${imgHtml}
      <div style="margin-top:16px">
        <span style="font-size:12px;color:var(--gold);font-weight:600">${p.category_name_bn || p.category_name || ''}</span>
        <h2 style="font-size:22px;font-weight:700;color:var(--green-deep);margin:8px 0">${p.name_bn || p.name}</h2>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <span style="font-size:24px;font-weight:700;color:var(--green-mid)">৳${price}</span>
          ${hasDiscount ? `<span style="font-size:16px;color:#999;text-decoration:line-through">৳${p.price}</span>` : ''}
        </div>
        <p style="font-size:14px;color:#555;line-height:1.8;margin-bottom:20px">${p.description_bn || p.description || ''}</p>
        <p style="font-size:13px;color:${p.stock > 0 ? '#22c55e' : '#e53e3e'};margin-bottom:16px">${p.stock > 0 ? `স্টক: ${p.stock}টি আছে` : 'স্টক শেষ'}</p>
        ${p.stock > 0
          ? `<button class="btn-primary" style="width:100%;text-align:center" onclick="addToCart({id:${p.id},name:'${(p.name_bn||p.name).replace(/'/g,"\\'")}',price:${price},image:'${p.image||''}'});document.getElementById('productModal').classList.remove('open')">🛒 কার্টে যোগ করুন</button>`
          : '<button class="btn-primary stock-out" disabled style="width:100%;text-align:center;opacity:0.5">স্টক শেষ</button>'
        }
      </div>`;

    modal.classList.add('open');
    fbViewContent(p);
  } catch(e) { console.error(e); }
}

// ===== CATEGORIES =====
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();

    const grid = document.getElementById('categoryGrid');
    if (grid) {
      const icons = ['📜', '🫒', '💧', '📖', '📦'];
      grid.innerHTML = categories.map((c, i) =>
        `<div class="category-card" onclick="filterByCategory('${c.slug}')">
          <div style="font-size:36px;margin-bottom:8px">${icons[i] || '📦'}</div>
          <h3>${c.name_bn || c.name}</h3>
        </div>`
      ).join('');
    }

    const filters = document.querySelector('.product-filters');
    if (filters) {
      let btns = '<button class="filter-btn active" data-cat="all" onclick="filterByCategory(\'all\')">সব</button>';
      categories.forEach(c => {
        btns += `<button class="filter-btn" data-cat="${c.slug}" onclick="filterByCategory('${c.slug}')">${c.name_bn || c.name}</button>`;
      });
      filters.innerHTML = btns;
    }
  } catch(e) { console.error(e); }
}

function filterByCategory(slug) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.filter-btn[data-cat="${slug}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  loadProducts(slug);
}

// ===== SETTINGS =====
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    shopSettings = await res.json();

    if (shopSettings.bkash_enabled) {
      const el = document.getElementById('bkashOption');
      if (el) el.style.display = 'flex';
    }
    if (shopSettings.nagad_enabled) {
      const el = document.getElementById('nagadOption');
      if (el) el.style.display = 'flex';
    }

    // Initialize Facebook Pixel
    if (shopSettings.facebook_pixel_id) {
      initFBPixel(shopSettings.facebook_pixel_id);
    }
  } catch(e) { console.error(e); }
}

// ===== FACEBOOK PIXEL & CAPI =====

function getCookie(name) {
  const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return v ? v.pop() : null;
}

function genEventId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function initFBPixel(pixelId) {
  if (window.fbq) return;
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
  (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', pixelId);
  fbq('track', 'PageView');
  sendServerEvent('PageView', genEventId('pv'), {});
}

function fbTrack(eventName, params, eventId) {
  if (typeof fbq === 'function') {
    fbq('track', eventName, params, { eventID: eventId });
  }
}

function sendServerEvent(eventName, eventId, customData, userData) {
  fetch('/api/fb-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_name: eventName,
      event_id: eventId,
      custom_data: customData,
      user_data: {
        fbc: getCookie('_fbc') || null,
        fbp: getCookie('_fbp') || null,
        ...(userData || {})
      },
      source_url: window.location.href
    })
  }).catch(() => {});
}

function fbViewContent(product) {
  const eventId = genEventId('vc');
  const params = {
    content_type: 'product',
    content_ids: [String(product.id)],
    content_name: product.name_bn || product.name,
    value: product.sale_price || product.price,
    currency: 'BDT'
  };
  fbTrack('ViewContent', params, eventId);
  sendServerEvent('ViewContent', eventId, params);
}

function fbAddToCart(product) {
  const eventId = genEventId('atc');
  const params = {
    content_type: 'product',
    content_ids: [String(product.id)],
    content_name: product.name_bn || product.name || product.name,
    value: product.price,
    currency: 'BDT'
  };
  fbTrack('AddToCart', params, eventId);
  sendServerEvent('AddToCart', eventId, params);
}

function fbInitiateCheckout() {
  const eventId = genEventId('ic');
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const params = {
    content_type: 'product',
    content_ids: cart.map(i => String(i.id)),
    num_items: cart.reduce((s, i) => s + i.quantity, 0),
    value: subtotal,
    currency: 'BDT'
  };
  fbTrack('InitiateCheckout', params, eventId);
  sendServerEvent('InitiateCheckout', eventId, params);
}

function fbPurchase(orderNumber, total, items, eventId) {
  const params = {
    content_type: 'product',
    content_ids: items.map(i => String(i.product_id)),
    num_items: items.reduce((s, i) => s + i.quantity, 0),
    value: total,
    currency: 'BDT',
    order_id: orderNumber
  };
  fbTrack('Purchase', params, eventId);
}

// ===== CHECKOUT =====
function renderCheckout() {
  const itemsDiv = document.getElementById('checkoutItems');
  const totalsDiv = document.getElementById('checkoutTotals');
  if (!itemsDiv) return;

  if (cart.length === 0) {
    itemsDiv.innerHTML = '<p style="text-align:center;color:#999">কার্ট খালি। <a href="/">পণ্য দেখুন</a></p>';
    return;
  }

  let subtotal = 0;
  itemsDiv.innerHTML = cart.map(item => {
    const total = item.price * item.quantity;
    subtotal += total;
    return `<div class="checkout-item"><span>${item.name} x${item.quantity}</span><span>৳${total}</span></div>`;
  }).join('');

  updateCheckoutTotals(subtotal);
}

function updateShipping() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  updateCheckoutTotals(subtotal);
}

function updateCheckoutTotals(subtotal) {
  const totalsDiv = document.getElementById('checkoutTotals');
  if (!totalsDiv) return;

  const district = document.getElementById('custDistrict');
  const isDhaka = district && (district.value === 'Dhaka' || district.value === 'Gazipur' || district.value === 'Narayanganj');
  const shipping = isDhaka ? (shopSettings.shipping_inside_dhaka || 60) : (shopSettings.shipping_outside_dhaka || 120);
  const discount = appliedCoupon ? (appliedCoupon.type === 'percent' ? subtotal * (appliedCoupon.value / 100) : appliedCoupon.value) : 0;
  const total = subtotal - discount + shipping;

  totalsDiv.innerHTML = `
    <div class="row"><span>সাবটোটাল:</span><span>৳${subtotal}</span></div>
    ${discount > 0 ? `<div class="row" style="color:#22c55e"><span>ডিসকাউন্ট:</span><span>-৳${discount}</span></div>` : ''}
    <div class="row"><span>ডেলিভারি চার্জ:</span><span>৳${shipping}</span></div>
    <div class="row total-row"><span>সর্বমোট:</span><span>৳${total}</span></div>
  `;
}

function selectHadiya(btn, amount) {
  document.querySelectorAll('.hadiya-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedHadiya = amount;
}

function selectPayment(el, method) {
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  selectedPayment = method;
}

async function applyCoupon() {
  const code = document.getElementById('couponCode').value.trim();
  const msg = document.getElementById('couponMsg');
  if (!code) return;
  try {
    const res = await fetch('/api/coupon/verify', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({code}) });
    const data = await res.json();
    if (!res.ok) { msg.innerHTML = `<span style="color:#e53e3e">${data.error}</span>`; appliedCoupon = null; return; }
    appliedCoupon = data;
    msg.innerHTML = `<span style="color:#22c55e">কুপন প্রয়োগ হয়েছে! ${data.type === 'percent' ? data.value + '%' : '৳' + data.value} ছাড়</span>`;
    const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    updateCheckoutTotals(subtotal);
  } catch(e) { msg.innerHTML = '<span style="color:#e53e3e">কিছু সমস্যা হয়েছে</span>'; }
}

async function submitOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'প্রসেস হচ্ছে...';

  const items = cart.map(item => ({ product_id: item.id, quantity: item.quantity }));
  const couponCode = document.getElementById('couponCode') ? document.getElementById('couponCode').value.trim() : '';

  const orderData = {
    customer_name: document.getElementById('custName').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    address: document.getElementById('custAddress').value.trim(),
    district: document.getElementById('custDistrict').value,
    city: document.getElementById('custCity') ? document.getElementById('custCity').value.trim() : '',
    items,
    hadiya_amount: selectedHadiya,
    payment_method: selectedPayment,
    problem_description: document.getElementById('custProblem') ? document.getElementById('custProblem').value.trim() : '',
    coupon_code: couponCode,
    _fbc: getCookie('_fbc') || null,
    _fbp: getCookie('_fbp') || null,
    _source_url: window.location.href
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'সমস্যা হয়েছে', 'error');
      btn.disabled = false;
      btn.textContent = '📦 অর্ডার নিশ্চিত করুন';
      return;
    }

    // FB Pixel Purchase (client-side, deduplicated with server via event_id)
    fbPurchase(data.order_number, data.total, items, data.event_id);

    cart = [];
    saveCart();
    window.location.href = `/order-success.html?order=${data.order_number}&total=${data.total}`;
  } catch(e) {
    showToast('সার্ভারে সমস্যা হয়েছে', 'error');
    btn.disabled = false;
    btn.textContent = '📦 অর্ডার নিশ্চিত করুন';
  }
}

// ===== TOAST =====
function showToast(msg, type) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = type === 'error' ? '#e53e3e' : 'var(--green-mid)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== DIRECT ORDER (Homepage Form) =====
let directHadiya = 2001;
let directProducts = [];
let directSelected = {};

function selectHadiyaDirect(btn, amount) {
  document.querySelectorAll('.hadiya-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  directHadiya = amount;
}

async function loadDirectProducts() {
  try {
    const res = await fetch('/api/products?limit=50');
    const data = await res.json();
    directProducts = data.products;
    renderDirectProducts();
  } catch(e) {}
}

function renderDirectProducts() {
  const list = document.getElementById('directProductList');
  if (!list || directProducts.length === 0) return;

  list.innerHTML = directProducts.map(p => {
    const price = p.sale_price || p.price;
    const checked = directSelected[p.id] ? 'checked' : '';
    const qty = directSelected[p.id]?.qty || 1;
    const selected = directSelected[p.id] ? 'selected' : '';
    return `<div class="direct-product-item ${selected}" onclick="toggleDirectProduct(${p.id}, ${price}, '${(p.name_bn||p.name).replace(/'/g,"\\'")}')">
      <input type="checkbox" ${checked} onclick="event.stopPropagation();toggleDirectProduct(${p.id}, ${price}, '${(p.name_bn||p.name).replace(/'/g,"\\'")}')">
      <div class="dp-info">
        <div class="dp-name">${p.name_bn || p.name}</div>
        <div class="dp-price">৳${price}${p.sale_price ? ` <span style="text-decoration:line-through;color:#999;font-weight:400;font-size:12px">৳${p.price}</span>` : ''}</div>
      </div>
      ${directSelected[p.id] ? `<div class="dp-qty" onclick="event.stopPropagation()">
        <button onclick="changeDirectQty(${p.id},-1)">-</button>
        <span>${qty}</span>
        <button onclick="changeDirectQty(${p.id},1)">+</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function toggleDirectProduct(id, price, name) {
  if (directSelected[id]) {
    delete directSelected[id];
  } else {
    directSelected[id] = { id, price, name, qty: 1 };
  }
  renderDirectProducts();
}

function changeDirectQty(id, delta) {
  if (!directSelected[id]) return;
  directSelected[id].qty += delta;
  if (directSelected[id].qty <= 0) delete directSelected[id];
  renderDirectProducts();
}

async function submitDirectOrder(e) {
  e.preventDefault();
  const selectedItems = Object.values(directSelected);
  if (selectedItems.length === 0) { showToast('অন্তত একটি পণ্য নির্বাচন করুন', 'error'); return; }

  const btn = document.getElementById('directSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'প্রসেস হচ্ছে...';

  const items = selectedItems.map(s => ({ product_id: s.id, quantity: s.qty }));

  const orderData = {
    customer_name: document.getElementById('dName').value.trim(),
    phone: document.getElementById('dPhone').value.trim(),
    address: document.getElementById('dAddress').value.trim(),
    district: document.getElementById('dDistrict').value,
    items,
    hadiya_amount: directHadiya,
    payment_method: 'cod',
    problem_description: document.getElementById('dProblem') ? document.getElementById('dProblem').value.trim() : '',
    _fbc: getCookie('_fbc') || null,
    _fbp: getCookie('_fbp') || null,
    _source_url: window.location.href
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'সমস্যা হয়েছে', 'error');
      btn.disabled = false;
      btn.textContent = '📦 অর্ডার নিশ্চিত করুন';
      return;
    }

    fbPurchase(data.order_number, data.total, items, data.event_id);
    window.location.href = `/order-success.html?order=${data.order_number}&total=${data.total}`;
  } catch(e) {
    showToast('সার্ভারে সমস্যা হয়েছে', 'error');
    btn.disabled = false;
    btn.textContent = '📦 অর্ডার নিশ্চিত করুন';
  }
}

// ===== SCROLL ANIMATIONS =====
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  loadCategories();
  loadProducts();
  loadDirectProducts();
  loadSettings();

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  document.getElementById('productModal')?.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});
