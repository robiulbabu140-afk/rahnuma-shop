const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { getDb, initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

initDatabase();

const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'rahnuma-shop-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

function generateOrderNumber() {
  const d = new Date();
  const prefix = 'RN';
  const date = d.getFullYear().toString().slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${date}${rand}`;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function getSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  return settings;
}

// ===== FACEBOOK CONVERSION API =====

function hashSHA256(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function sendFBConversionEvent(eventName, eventData, userData, customData, sourceUrl) {
  const settings = getSettings();
  const pixelId = settings.facebook_pixel_id;
  const accessToken = settings.facebook_access_token;
  if (!pixelId || !accessToken) return;

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventData.event_id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event_source_url: sourceUrl || '',
      action_source: 'website',
      user_data: {
        ph: userData.phone ? [hashSHA256(userData.phone)] : undefined,
        fn: userData.name ? [hashSHA256(userData.name.split(' ')[0])] : undefined,
        ln: userData.name && userData.name.split(' ').length > 1 ? [hashSHA256(userData.name.split(' ').slice(1).join(' '))] : undefined,
        ct: userData.city ? [hashSHA256(userData.city)] : undefined,
        country: [hashSHA256('bd')],
        client_ip_address: userData.ip || undefined,
        client_user_agent: userData.user_agent || undefined,
        fbc: userData.fbc || undefined,
        fbp: userData.fbp || undefined,
      },
      custom_data: customData
    }]
  };

  const testCode = settings.facebook_test_event_code;
  if (testCode) payload.test_event_code = testCode;

  const postData = JSON.stringify(payload);
  const options = {
    hostname: 'graph.facebook.com',
    path: `/v21.0/${pixelId}/events?access_token=${accessToken}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => {
      if (res.statusCode !== 200) console.error('FB CAPI Error:', body);
      else console.log('FB CAPI sent:', eventName);
    });
  });
  req.on('error', (e) => console.error('FB CAPI request error:', e.message));
  req.write(postData);
  req.end();
}

// ===== PUBLIC API =====

app.get('/api/settings', (req, res) => {
  const s = getSettings();
  res.json({
    shop_name: s.shop_name,
    shop_name_en: s.shop_name_en,
    shop_phone: s.shop_phone,
    shipping_inside_dhaka: Number(s.shipping_inside_dhaka),
    shipping_outside_dhaka: Number(s.shipping_outside_dhaka),
    currency: s.currency,
    cod_enabled: s.cod_enabled === '1',
    bkash_enabled: s.bkash_enabled === '1',
    bkash_number: s.bkash_number,
    nagad_enabled: s.nagad_enabled === '1',
    nagad_number: s.nagad_number,
    whatsapp_number: s.whatsapp_number,
    messenger_link: s.messenger_link,
    facebook_page: s.facebook_page,
    facebook_pixel_id: s.facebook_pixel_id || '',
  });
});

app.get('/api/products', (req, res) => {
  const db = getDb();
  const { category, featured, search, page = 1, limit = 20 } = req.query;
  let sql = 'SELECT p.*, c.name as category_name, c.name_bn as category_name_bn FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1';
  const params = [];

  if (category) {
    sql += ' AND c.slug = ?';
    params.push(category);
  }
  if (featured === '1') {
    sql += ' AND p.is_featured = 1';
  }
  if (search) {
    sql += ' AND (p.name LIKE ? OR p.name_bn LIKE ? OR p.description LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const countSql = sql.replace('SELECT p.*, c.name as category_name, c.name_bn as category_name_bn', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;

  sql += ' ORDER BY p.is_featured DESC, p.sort_order ASC, p.created_at DESC LIMIT ? OFFSET ?';
  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);

  const products = db.prepare(sql).all(...params);
  res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

app.get('/api/products/:slug', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT p.*, c.name as category_name, c.name_bn as category_name_bn FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = ? AND p.is_active = 1').get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  db.prepare('UPDATE products SET views = views + 1 WHERE id = ?').run(product.id);
  res.json(product);
});

app.get('/api/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC').all();
  res.json(categories);
});

app.post('/api/orders', (req, res) => {
  const db = getDb();
  const { customer_name, phone, address, district, city, area, items, hadiya_amount, payment_method, problem_description, coupon_code } = req.body;

  if (!customer_name || !phone || !address || !items || !items.length) {
    return res.status(400).json({ error: 'নাম, ফোন, ঠিকানা এবং পণ্য প্রয়োজন' });
  }

  const phoneClean = phone.replace(/[^0-9]/g, '');
  if (phoneClean.length < 11) {
    return res.status(400).json({ error: 'সঠিক ফোন নম্বর দিন' });
  }

  let subtotal = 0;
  const orderItems = [];
  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(item.product_id);
    if (!product) return res.status(400).json({ error: `পণ্য পাওয়া যায়নি (ID: ${item.product_id})` });
    if (product.stock < item.quantity) return res.status(400).json({ error: `"${product.name_bn || product.name}" স্টকে নেই` });
    const price = product.sale_price || product.price;
    const total = price * item.quantity;
    subtotal += total;
    orderItems.push({ product_id: product.id, product_name: product.name_bn || product.name, quantity: item.quantity, price, total });
  }

  let discount = 0;
  if (coupon_code) {
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(coupon_code.toUpperCase());
    if (coupon) {
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return res.status(400).json({ error: 'কুপন মেয়াদ শেষ' });
      }
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
        return res.status(400).json({ error: 'কুপন ব্যবহারের সীমা শেষ' });
      }
      if (subtotal < coupon.min_order) {
        return res.status(400).json({ error: `ন্যূনতম অর্ডার ৳${coupon.min_order} হতে হবে` });
      }
      discount = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
      if (discount > subtotal) discount = subtotal;
      db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
    }
  }

  const settings = getSettings();
  const isDhaka = district && district.toLowerCase().includes('dhaka');
  const shippingCost = isDhaka ? Number(settings.shipping_inside_dhaka) : Number(settings.shipping_outside_dhaka);
  const totalAmount = subtotal - discount + shippingCost;

  const orderNumber = generateOrderNumber();

  let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phoneClean);
  if (customer) {
    db.prepare('UPDATE customers SET name = ?, address = ?, district = ?, city = ?, area = ?, total_orders = total_orders + 1, total_spent = total_spent + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(customer_name, address, district || '', city || '', area || '', totalAmount, customer.id);
  } else {
    const result = db.prepare('INSERT INTO customers (name, phone, address, district, city, area, total_orders, total_spent) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
      .run(customer_name, phoneClean, address, district || '', city || '', area || '', totalAmount);
    customer = { id: result.lastInsertRowid };
  }

  const fraudScore = calculateFraudScore(db, phoneClean);

  const orderResult = db.prepare(`INSERT INTO orders (order_number, customer_id, customer_name, phone, address, district, city, area, subtotal, shipping_cost, discount, total_amount, hadiya_amount, status, payment_method, payment_status, problem_description, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(orderNumber, customer.id, customer_name, phoneClean, address, district || '', city || '', area || '', subtotal, shippingCost, discount, totalAmount, hadiya_amount || 0, fraudScore > 70 ? 'flagged' : 'pending', payment_method || 'cod', 'unpaid', problem_description || '', req.ip);

  const orderId = orderResult.lastInsertRowid;
  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?)');
  const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

  for (const item of orderItems) {
    insertItem.run(orderId, item.product_id, item.product_name, item.quantity, item.price, item.total);
    updateStock.run(item.quantity, item.product_id);
  }

  // Facebook Conversion API — Purchase Event (Server-Side)
  const eventId = `purchase_${orderNumber}_${Date.now()}`;
  sendFBConversionEvent('Purchase', { event_id: eventId }, {
    phone: phoneClean,
    name: customer_name,
    city: city || district || '',
    ip: req.ip,
    user_agent: req.headers['user-agent'],
    fbc: req.body._fbc || null,
    fbp: req.body._fbp || null,
  }, {
    currency: 'BDT',
    value: totalAmount,
    content_type: 'product',
    contents: orderItems.map(i => ({ id: String(i.product_id), quantity: i.quantity, item_price: i.price })),
    order_id: orderNumber,
    num_items: orderItems.reduce((s, i) => s + i.quantity, 0),
  }, req.body._source_url || '');

  res.json({ success: true, order_number: orderNumber, total: totalAmount, event_id: eventId, message: 'অর্ডার সফলভাবে সম্পন্ন হয়েছে!' });
});

// Server-side CAPI relay for client events (deduplication with browser Pixel)
app.post('/api/fb-event', (req, res) => {
  const { event_name, event_id, custom_data, user_data, source_url } = req.body;
  if (!event_name) return res.status(400).json({ error: 'event_name required' });

  sendFBConversionEvent(event_name, { event_id: event_id || undefined }, {
    phone: user_data?.phone || null,
    name: user_data?.name || null,
    city: user_data?.city || null,
    ip: req.ip,
    user_agent: req.headers['user-agent'],
    fbc: user_data?.fbc || null,
    fbp: user_data?.fbp || null,
  }, custom_data || {}, source_url || req.headers.referer || '');

  res.json({ success: true });
});

app.get('/api/orders/track/:orderNumber', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT order_number, customer_name, status, total_amount, shipping_cost, payment_method, payment_status, courier, tracking_number, created_at FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'অর্ডার পাওয়া যায়নি' });
  const items = db.prepare('SELECT product_name, quantity, price, total FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_number = ?)').all(req.params.orderNumber);
  res.json({ order, items });
});

app.post('/api/coupon/verify', (req, res) => {
  const db = getDb();
  const { code } = req.body;
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get((code || '').toUpperCase());
  if (!coupon) return res.status(404).json({ error: 'কুপন পাওয়া যায়নি' });
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ error: 'কুপন মেয়াদ শেষ' });
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return res.status(400).json({ error: 'কুপন ব্যবহারের সীমা শেষ' });
  res.json({ type: coupon.type, value: coupon.value, min_order: coupon.min_order });
});

function calculateFraudScore(db, phone) {
  const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (!customer) return 0;
  let score = 0;
  const cancelled = db.prepare("SELECT COUNT(*) as c FROM orders WHERE phone = ? AND status = 'cancelled'").get(phone).c;
  const returned = db.prepare("SELECT COUNT(*) as c FROM orders WHERE phone = ? AND status = 'returned'").get(phone).c;
  const total = db.prepare('SELECT COUNT(*) as c FROM orders WHERE phone = ?').get(phone).c;
  if (total > 0) {
    const failRate = (cancelled + returned) / total;
    if (failRate > 0.5) score += 50;
    else if (failRate > 0.3) score += 30;
  }
  if (cancelled > 3) score += 20;
  if (returned > 2) score += 20;
  if (customer.is_blocked) score = 100;
  return Math.min(score, 100);
}

// ===== ADMIN AUTH =====

app.post('/api/admin/login', (req, res) => {
  const db = getDb();
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
  }
  req.session.admin = { id: user.id, username: user.username, name: user.name, role: user.role };
  res.json({ success: true, user: { name: user.name, role: user.role } });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json(req.session.admin);
});

// ===== ADMIN DASHBOARD =====

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const todaySales = db.prepare("SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue FROM orders WHERE DATE(created_at) = ? AND status != 'cancelled'").get(today);
  const monthSales = db.prepare("SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue FROM orders WHERE DATE(created_at) >= ? AND status != 'cancelled'").get(monthStart);
  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active = 1').get().c;

  const statusCounts = db.prepare("SELECT status, COUNT(*) as c FROM orders GROUP BY status").all();
  const statusMap = {};
  statusCounts.forEach(s => { statusMap[s.status] = s.c; });

  const pendingOrders = statusMap.pending || 0;
  const confirmedOrders = statusMap.confirmed || 0;
  const shippedOrders = statusMap.shipped || 0;
  const deliveredOrders = statusMap.delivered || 0;
  const cancelledOrders = statusMap.cancelled || 0;
  const returnedOrders = statusMap.returned || 0;
  const flaggedOrders = statusMap.flagged || 0;

  const lowStockProducts = db.prepare('SELECT id, name, name_bn, stock, low_stock_alert FROM products WHERE is_active = 1 AND stock <= low_stock_alert ORDER BY stock ASC LIMIT 10').all();

  const recentOrders = db.prepare('SELECT order_number, customer_name, phone, total_amount, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10').all();

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const data = db.prepare("SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue FROM orders WHERE DATE(created_at) = ? AND status != 'cancelled'").get(dateStr);
    last7Days.push({ date: dateStr, orders: data.orders, revenue: data.revenue });
  }

  const delivered = db.prepare("SELECT COALESCE(SUM(total_amount),0) as total FROM orders WHERE status = 'delivered'").get().total;
  const totalExpenses = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses').get().total;
  const costOfGoods = db.prepare("SELECT COALESCE(SUM(oi.quantity * p.cost_price),0) as total FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id WHERE o.status = 'delivered'").get().total;

  res.json({
    today: todaySales,
    month: monthSales,
    totalOrders, totalCustomers, totalProducts,
    pendingOrders, confirmedOrders, shippedOrders, deliveredOrders, cancelledOrders, returnedOrders, flaggedOrders,
    lowStockProducts,
    recentOrders,
    last7Days,
    profit: { revenue: delivered, costOfGoods, expenses: totalExpenses, net: delivered - costOfGoods - totalExpenses }
  });
});

// ===== ADMIN ORDERS =====

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const db = getDb();
  const { status, search, page = 1, limit = 25, date_from, date_to } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (search) {
    sql += ' AND (order_number LIKE ? OR customer_name LIKE ? OR phone LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (date_from) { sql += ' AND DATE(created_at) >= ?'; params.push(date_from); }
  if (date_to) { sql += ' AND DATE(created_at) <= ?'; params.push(date_to); }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);

  const orders = db.prepare(sql).all(...params);
  res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

app.get('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT oi.*, p.image FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?').all(order.id);
  const customer = order.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id) : null;
  res.json({ order, items, customer });
});

app.put('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const db = getDb();
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'returned', 'cancelled', 'flagged'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  const updates = { status, updated_at: new Date().toISOString() };
  if (status === 'confirmed') updates.confirmed_at = new Date().toISOString();
  if (status === 'shipped') updates.shipped_at = new Date().toISOString();
  if (status === 'delivered') {
    updates.delivered_at = new Date().toISOString();
    updates.payment_status = 'paid';
  }

  if (status === 'cancelled' && order.status !== 'delivered') {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const restoreStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    items.forEach(item => { if (item.product_id) restoreStock.run(item.quantity, item.product_id); });
  }

  let setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE orders SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

  res.json({ success: true });
});

app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { courier, tracking_number, notes, payment_status } = req.body;
  db.prepare('UPDATE orders SET courier = COALESCE(?, courier), tracking_number = COALESCE(?, tracking_number), notes = COALESCE(?, notes), payment_status = COALESCE(?, payment_status), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(courier || null, tracking_number || null, notes || null, payment_status || null, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== ADMIN PRODUCTS =====

app.get('/api/admin/products', requireAdmin, (req, res) => {
  const db = getDb();
  const { search, category, page = 1, limit = 25 } = req.query;
  let sql = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (p.name LIKE ? OR p.name_bn LIKE ? OR p.sku LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (category) { sql += ' AND p.category_id = ?'; params.push(Number(category)); }

  const countSql = sql.replace('SELECT p.*, c.name as category_name', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;

  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);

  const products = db.prepare(sql).all(...params);
  res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const db = getDb();
  const { name, name_bn, description, description_bn, price, sale_price, cost_price, sku, category_id, stock, low_stock_alert, image, tags, is_active, is_featured } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });

  const slug = (name_bn || name).toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

  const result = db.prepare(`INSERT INTO products (name, name_bn, slug, description, description_bn, price, sale_price, cost_price, sku, category_id, stock, low_stock_alert, image, tags, is_active, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, name_bn || '', slug, description || '', description_bn || '', price, sale_price || null, cost_price || null, sku || null, category_id || null, stock || 0, low_stock_alert || 5, image || '', tags || '', is_active !== undefined ? is_active : 1, is_featured || 0);

  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const fields = req.body;
  const allowed = ['name', 'name_bn', 'description', 'description_bn', 'price', 'sale_price', 'cost_price', 'sku', 'category_id', 'stock', 'low_stock_alert', 'image', 'tags', 'is_active', 'is_featured'];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) { sets.push(`${key} = ?`); vals.push(fields[key]); }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at = CURRENT_TIMESTAMP');
  vals.push(req.params.id);
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ success: true });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== ADMIN CATEGORIES =====

app.get('/api/admin/categories', requireAdmin, (req, res) => {
  const db = getDb();
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
  res.json(cats);
});

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const db = getDb();
  const { name, name_bn, description, parent_id } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const result = db.prepare('INSERT INTO categories (name, name_bn, slug, description, parent_id) VALUES (?, ?, ?, ?, ?)').run(name, name_bn || '', slug, description || '', parent_id || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { name, name_bn, description, is_active, sort_order } = req.body;
  db.prepare('UPDATE categories SET name = COALESCE(?, name), name_bn = COALESCE(?, name_bn), description = COALESCE(?, description), is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order) WHERE id = ?')
    .run(name || null, name_bn || null, description || null, is_active !== undefined ? is_active : null, sort_order !== undefined ? sort_order : null, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== ADMIN CUSTOMERS =====

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const db = getDb();
  const { search, page = 1, limit = 25 } = req.query;
  let sql = 'SELECT * FROM customers WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (name LIKE ? OR phone LIKE ? OR address LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));
  const customers = db.prepare(sql).all(...params);
  res.json({ customers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

app.get('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customer.id);
  res.json({ customer, orders });
});

app.put('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { notes, is_blocked } = req.body;
  db.prepare('UPDATE customers SET notes = COALESCE(?, notes), is_blocked = COALESCE(?, is_blocked), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(notes !== undefined ? notes : null, is_blocked !== undefined ? is_blocked : null, req.params.id);
  res.json({ success: true });
});

// ===== ADMIN COUPONS =====

app.get('/api/admin/coupons', requireAdmin, (req, res) => {
  const db = getDb();
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
  res.json(coupons);
});

app.post('/api/admin/coupons', requireAdmin, (req, res) => {
  const db = getDb();
  const { code, type, value, min_order, max_uses, expires_at } = req.body;
  const result = db.prepare('INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run((code || '').toUpperCase(), type || 'fixed', value, min_order || 0, max_uses || null, expires_at || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== ADMIN EXPENSES =====

app.get('/api/admin/expenses', requireAdmin, (req, res) => {
  const db = getDb();
  const { month } = req.query;
  let sql = 'SELECT * FROM expenses';
  const params = [];
  if (month) { sql += ' WHERE date LIKE ?'; params.push(month + '%'); }
  sql += ' ORDER BY date DESC';
  const expenses = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses' + (month ? ' WHERE date LIKE ?' : '')).get(...params).total;
  res.json({ expenses, total });
});

app.post('/api/admin/expenses', requireAdmin, (req, res) => {
  const db = getDb();
  const { category, amount, description, date } = req.body;
  const result = db.prepare('INSERT INTO expenses (category, amount, description, date) VALUES (?, ?, ?, ?)').run(category, amount, description || '', date || new Date().toISOString().split('T')[0]);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/admin/expenses/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== ADMIN SETTINGS =====

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json(getSettings());
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [key, value] of Object.entries(req.body)) {
    upsert.run(key, String(value));
  }
  res.json({ success: true });
});

// ===== ADMIN REPORTS =====

app.get('/api/admin/reports/sales', requireAdmin, (req, res) => {
  const db = getDb();
  const { from, to, group_by = 'day' } = req.query;
  let dateFormat = '%Y-%m-%d';
  if (group_by === 'month') dateFormat = '%Y-%m';
  if (group_by === 'year') dateFormat = '%Y';

  let sql = `SELECT strftime('${dateFormat}', created_at) as period, COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue, COALESCE(SUM(CASE WHEN status='delivered' THEN total_amount ELSE 0 END),0) as delivered_revenue FROM orders WHERE status != 'cancelled'`;
  const params = [];
  if (from) { sql += ' AND DATE(created_at) >= ?'; params.push(from); }
  if (to) { sql += ' AND DATE(created_at) <= ?'; params.push(to); }
  sql += ` GROUP BY period ORDER BY period DESC`;

  const data = db.prepare(sql).all(...params);
  res.json(data);
});

app.get('/api/admin/reports/products', requireAdmin, (req, res) => {
  const db = getDb();
  const topProducts = db.prepare(`SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.total) as total_revenue FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.status != 'cancelled' GROUP BY oi.product_id ORDER BY total_sold DESC LIMIT 20`).all();
  res.json(topProducts);
});

// ===== FILE UPLOAD =====

app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ===== ADMIN PASSWORD =====

app.put('/api/admin/password', requireAdmin, (req, res) => {
  const db = getDb();
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.admin.id);
  if (!bcrypt.compareSync(current_password, user.password)) {
    return res.status(400).json({ error: 'বর্তমান পাসওয়ার্ড ভুল' });
  }
  const hashed = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(hashed, user.id);
  res.json({ success: true });
});

// ===== SPA FALLBACKS =====

app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  রাহনুমা শপ সার্ভার চালু আছে!`);
  console.log(`  শপ:    http://localhost:${PORT}`);
  console.log(`  অ্যাডমিন: http://localhost:${PORT}/admin/`);
  console.log(`  অ্যাডমিন লগিন: admin / admin123\n`);
});
