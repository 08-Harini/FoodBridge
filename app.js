import { auth, db, storage } from './firebase-config.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

window.auth = auth;
window.db = db;
window.storage = storage;

let currentUser = null, userProfile = null, currentPage = 'home';


function navigate(page, params = {}) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (!el) {
    navigate('home');
    return;
  }
  el.classList.add('active');
  currentPage = page;
  window.scrollTo(0, 0);
  updateNav();
 const fn = window['init_' + page.replace(/-/g, '_')];
  if (fn) fn(params);
}
window.navigate = navigate;


function updateNav() {
  const loggedIn = !!currentUser;

  document.getElementById('nav-guest').classList.toggle('hidden', loggedIn);
  document.getElementById('nav-user').classList.toggle('hidden', !loggedIn);

  if (loggedIn && userProfile) {
    document.getElementById('nav-user-name').textContent = (userProfile.fullName || '').split(' ')[0];
    document.getElementById('nav-user-av').textContent = (userProfile.fullName || 'U')[0].toUpperCase();

    const donateBtn = document.getElementById('nav-donate-btn');
    if (donateBtn) donateBtn.classList.toggle('hidden', userProfile.role !== 'donor');

    const adminLink = document.getElementById('nav-admin-link');
    if (adminLink) adminLink.classList.toggle('hidden', userProfile.role !== 'admin');
  }

  document.querySelectorAll('.nav-links a[data-page]').forEach(a =>
    a.classList.toggle('active', a.dataset.page === currentPage)
  );
}


function toast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4500);
}
window.toast = toast;


function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function expiryLabel(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = d - Date.now();
  if (diff <= 0) return '<span class="expiry-label urgent">⚠ Expired</span>';
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  return `<span class="expiry-label ${h < 3 ? 'urgent' : ''}">${h > 0 ? h + 'h ' : ''}${m}m left</span>`;
}

function foodTypeBadge(type) {
  const map = {
    veg: ['type-veg', '🟢 Veg'],
    'non-veg': ['type-nonveg', '🔴 Non-Veg'],
    vegan: ['type-vegan', '🌱 Vegan'],
    mixed: ['type-mixed', 'Mixed']
  };
  const [cls, label] = map[type] || ['type-mixed', type || ''];
  return `<span class="food-type-badge ${cls}">${label}</span>`;
}

function statusBadge(s) {
  return `<span class="status status-${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
}

function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

function ucfirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function loading(btn, state) {
  if (!btn) return;
  if (state) {
    btn.disabled = true;
    btn._orig = btn.textContent;
    btn.textContent = 'Loading...';
  } else {
    btn.disabled = false;
    btn.textContent = btn._orig || 'Submit';
  }
}

window.previewImg = function(input) {
  const prev = document.getElementById('don-preview');
  if (input.files && input.files[0]) {
    const r = new FileReader();
    r.onload = e => {
      prev.src = e.target.result;
      prev.style.display = 'block';
    };
    r.readAsDataURL(input.files[0]);
  }
};


async function refreshUserProfile() {
  if (!currentUser) return null;

  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid));

    if (snap.exists()) {
      userProfile = { ...snap.data(), uid: currentUser.uid };
    } else {
      userProfile = {
        uid: currentUser.uid,
        fullName: currentUser.displayName || 'User',
        email: currentUser.email || '',
        role: 'receiver',
        isActive: true
      };
    }

    const ADMIN_EMAILS = ['harinig455@gmail.com'];
    if (ADMIN_EMAILS.includes((currentUser.email || '').toLowerCase().trim())) {
      userProfile.role = 'admin';
    }

    userProfile.role = String(userProfile.role || 'receiver').toLowerCase().trim();

    window.userProfile = userProfile;
    console.log('Refreshed profile:', userProfile);

    updateNav();
    return userProfile;
  } catch (e) {
    console.error('refreshUserProfile error:', e);
    return null;
  }
}
window.refreshUserProfile = refreshUserProfile;

onAuthStateChanged(auth, async user => {
  const loader = document.getElementById('app-loader');

  if (user) {
    currentUser = user;

    try {
      const snap = await getDoc(doc(db, 'users', user.uid));

      if (snap.exists()) {
        userProfile = { ...snap.data(), uid: user.uid };
      } else {
        userProfile = {
          uid: user.uid,
          fullName: user.displayName || 'User',
          email: user.email || '',
          role: 'receiver',
          isActive: true
        };
      }

      const ADMIN_EMAILS = ['harinig455@gmail.com'];
      if (ADMIN_EMAILS.includes((user.email || '').toLowerCase().trim())) {
        userProfile.role = 'admin';
      }

      userProfile.role = String(userProfile.role || 'receiver').toLowerCase().trim();

      window.currentUser = currentUser;
      window.userProfile = userProfile;

      console.log('Logged in UID:', user.uid);
      console.log('Logged in email:', user.email);
      console.log('User profile:', userProfile);
      console.log('Resolved role:', userProfile.role);

      updateNotifBadge();
    } catch (err) {
      console.error('Auth profile load error:', err);
      userProfile = null;
    }
  } else {
    currentUser = null;
    userProfile = null;
    window.currentUser = null;
    window.userProfile = null;
  }

  if (loader) loader.classList.add('hidden');
  updateNav();

  const hashPage = location.hash.replace('#', '') || 'home';
  navigate(hashPage);
});


window.init_register = function() {
  if (currentUser) navigate('dashboard');
};

window.doRegister = async function(e) {
  e.preventDefault();

  const btn = document.getElementById('reg-btn');
  const fullName = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const phone = document.getElementById('reg-phone').value.trim();
  const city = document.getElementById('reg-city').value.trim();
  let role = document.querySelector('.role-opt.selected')?.dataset.role;
  const password = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-confirm').value;

  if (!role) {
    toast('Please select a role.', 'error');
    return;
  }
  if (!fullName) {
    toast('Full name is required.', 'error');
    return;
  }
  if (password !== confirm) {
    toast('Passwords do not match.', 'error');
    return;
  }
  if (password.length < 6) {
    toast('Password must be at least 6 characters.', 'error');
    return;
  }

  if (email === 'harinig455@gmail.com') {
    role = 'admin';
  }

  loading(btn, true);

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });

    const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(db, 'users', cred.user.uid), {
      fullName,
      email,
      phone,
      city,
      role,
      isActive: true,
      createdAt: serverTimestamp()
    });

    toast('Account created! Welcome to FoodBridge 🌾');
    navigate('dashboard');
  } catch (err) {
    toast(err.message, 'error');
  }

  loading(btn, false);
};

window.selectRole = function(el) {
  document.querySelectorAll('.role-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
};

// ── LOGIN ────────────────────────────────────────────────────
window.init_login = function() {
  if (currentUser) navigate('dashboard');
};

window.doLogin = async function(e) {
  e.preventDefault();

  const btn = document.getElementById('login-btn');
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;

  loading(btn, true);

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast('Welcome back! 👋');
    navigate('dashboard');
  } catch (err) {
    console.error('Login error:', err);
    toast('Invalid email or password.', 'error');
  }

  loading(btn, false);
};

window.doLogout = async function() {
  await signOut(auth);
  toast('Logged out.');
  navigate('home');
};

// ── HOME ─────────────────────────────────────────────────────
window.init_home = async function() {
  try {
    const [dS, uS] = await Promise.all([
      getDocs(collection(db, 'donations')),
      getDocs(collection(db, 'users'))
    ]);

    const all = dS.docs.map(d => d.data());
    document.getElementById('stat-donations').textContent = all.length;
    document.getElementById('stat-distributed').textContent = all.filter(d => d.status === 'distributed').length;
    document.getElementById('stat-users').textContent = uS.size;
    document.getElementById('stat-available').textContent = all.filter(d => d.status === 'available').length;
  } catch (e) {}

  try {
    const snap = await getDocs(
      query(
        collection(db, 'donations'),
        where('status', '==', 'available'),
        orderBy('createdAt', 'desc'),
        limit(6)
      )
    );
    const grid = document.getElementById('home-food-grid');
    grid.innerHTML = snap.empty
      ? '<p class="text-muted text-center" style="padding:40px;grid-column:1/-1">No food listed yet. Be the first!</p>'
      : snap.docs.map(d => foodCardHTML(d.id, d.data())).join('');
  } catch (e) {
    console.error(e);
  }
};

// ── LISTINGS ─────────────────────────────────────────────────
window.init_listings = function() {
  loadListings();
};

async function loadListings() {
  const search = document.getElementById('filter-search')?.value.toLowerCase().trim() || '';
  const typeF = document.getElementById('filter-type')?.value || '';
  const cityF = document.getElementById('filter-city')?.value.toLowerCase().trim() || '';
  const grid = document.getElementById('listings-grid');

  if (!grid) return;

  grid.innerHTML = '<p class="text-muted text-center" style="padding:48px;grid-column:1/-1">Loading...</p>';

  try {
    const snap = await getDocs(
      query(
        collection(db, 'donations'),
        where('status', '==', 'available')
      )
    );

    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // remove expired food
    items = items.filter(i => {
      if (!i.expiryTime) return true;
      const exp = i.expiryTime.toDate ? i.expiryTime.toDate() : new Date(i.expiryTime);
      return exp > new Date();
    });

    // sort latest first
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (typeF) items = items.filter(i => (i.foodType || '') === typeF);
    if (cityF) items = items.filter(i => (i.city || '').toLowerCase().includes(cityF));
    if (search) {
      items = items.filter(i =>
        (i.foodName || '').toLowerCase().includes(search) ||
        (i.category || '').toLowerCase().includes(search) ||
        (i.city || '').toLowerCase().includes(search) ||
        (i.description || '').toLowerCase().includes(search)
      );
    }

    grid.innerHTML = items.length
      ? items.map(i => foodCardHTML(i.id, i)).join('')
      : '<p class="text-muted text-center" style="padding:48px;grid-column:1/-1">No food found.</p>';

  } catch (e) {
    console.error('loadListings error:', e);
    grid.innerHTML = '<p class="text-muted text-center" style="padding:48px;grid-column:1/-1">Error loading food listings.</p>';
  }
}
window.loadListings = loadListings;

function foodCardHTML(id, d) {
  const img = d.imageUrl
    ? `<img src="${sanitize(d.imageUrl)}" alt="${sanitize(d.foodName)}" loading="lazy">`
    : `<span class="no-photo">🍽️</span>`;

  return `<div class="food-card" onclick="navigate('food-detail',{id:'${id}'})">
    <div class="food-card-thumb">
      ${img}
      ${foodTypeBadge(d.foodType)}
    </div>
    <div class="food-card-body">
      <div class="food-card-title">${sanitize(d.foodName)}</div>

      ${d.description ? `<p style="font-size:.85rem;color:var(--mid);margin:8px 0 10px">${sanitize(d.description)}</p>` : ''}

      <div class="food-tags">
        <span class="food-tag">📦 ${sanitize(d.quantity)} ${sanitize(d.quantityUnit)}</span>
        <span class="food-tag">📍 ${sanitize(d.city || '')}</span>
        <span class="food-tag">🏷 ${sanitize(d.category || '')}</span>
        <span class="food-tag">👤 ${sanitize(d.donorName || '')}</span>
        ${d.donorPhone ? `<span class="food-tag">📞 ${sanitize(d.donorPhone)}</span>` : ''}
        ${d.pickupDate ? `<span class="food-tag">📅 ${sanitize(d.pickupDate)}</span>` : ''}
      </div>

      <div class="food-card-footer">
        ${expiryLabel(d.expiryTime)}
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();navigate('food-detail',{id:'${id}'})">View Details</button>
      </div>
    </div>
  </div>`;
}

// ── FOOD DETAIL ──────────────────────────────────────────────
window.init_food_detail = async function({ id } = {}) {
  if (!id) {
    navigate('listings');
    return;
  }

  const c = document.getElementById('food-detail-content');
  c.innerHTML = '<p class="text-muted text-center" style="padding:60px">Loading...</p>';

  try {
    const snap = await getDoc(doc(db, 'donations', id));
    if (!snap.exists()) {
      toast('Food not found.', 'error');
      navigate('listings');
      return;
    }

    const d = snap.data();
    const isOwner = currentUser && d.donorId === currentUser.uid;
    const isReceiver = userProfile?.role === 'receiver';
    const isExpired = d.expiryTime?.toDate?.() < new Date();

    let alreadyRequested = false;
    if (currentUser && isReceiver) {
      const rS = await getDocs(
        query(
          collection(db, 'requests'),
          where('foodId', '==', id),
          where('receiverId', '==', currentUser.uid),
          where('status', 'in', ['pending', 'accepted'])
        )
      );
      alreadyRequested = !rS.empty;
    }

    const img = d.imageUrl
      ? `<img src="${sanitize(d.imageUrl)}" alt="${sanitize(d.foodName)}">`
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%"><span class="big-emoji">🍽️</span></div>`;

    let action = '';
    if (!currentUser) {
      action = `<div class="request-box"><p class="fw-6" style="color:var(--green);margin-bottom:8px">Want this food?</p><p class="text-muted" style="font-size:.87rem;margin-bottom:12px">Login or register as a receiver.</p><button class="btn btn-primary btn-sm" onclick="navigate('login')">Login to Request</button> <button class="btn btn-secondary btn-sm" onclick="navigate('register')">Register</button></div>`;
    } else if (isOwner) {
      action = `<div class="flex gap-2 mt-4"><button class="btn btn-danger" onclick="deleteDonation('${id}')">🗑 Delete</button></div>`;
    } else if (isReceiver && !isExpired && d.status === 'available') {
      action = alreadyRequested
        ? `<div class="request-box"><p style="color:var(--green);font-weight:600">✅ Already requested.</p><a style="color:var(--green);font-size:.87rem;cursor:pointer" onclick="navigate('my-requests')">Check status →</a></div>`
        : `<div class="request-box"><h4>🙏 Request This Food</h4>
           <div class="form-group"><label class="form-label">Quantity Needed</label>
             <input type="number" id="req-qty" class="form-input" min="1" max="${d.quantity}" value="1">
             <div class="form-hint">Max: ${sanitize(d.quantity)} ${sanitize(d.quantityUnit)}</div></div>
           <div class="form-group"><label class="form-label">Purpose</label>
             <textarea id="req-purpose" class="form-input" placeholder="e.g., Shelter serving 40 people"></textarea></div>
           <button class="btn btn-primary btn-full" id="req-btn" onclick="submitRequest('${id}','${sanitize(d.donorId)}','${sanitize(d.foodName)}')">Submit Request →</button>
          </div>`;
    } else if (isExpired) {
      action = `<div class="request-box"><p style="color:var(--orange)">⚠️ This listing has expired.</p></div>`;
    } else if (d.status !== 'available') {
      action = `<div class="request-box"><p style="color:var(--mid)">No longer available.</p></div>`;
    }

    c.innerHTML = `<div class="food-detail-grid">
      <div class="food-detail-img">${img}</div>
      <div class="food-detail-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">
          <h1 class="detail-title">${sanitize(d.foodName)}</h1>
          ${statusBadge(isExpired ? 'expired' : d.status)}
        </div>
        <div class="detail-meta-row">${foodTypeBadge(d.foodType)}<span class="food-tag">🏷 ${sanitize(d.category || '')}</span></div>
        ${d.description ? `<p style="color:var(--mid);font-size:.9rem;margin-bottom:16px;line-height:1.7">${sanitize(d.description)}</p>` : ''}
        <div class="detail-info-row"><i class="fas fa-box"></i><div><strong>Quantity</strong>${sanitize(d.quantity)} ${sanitize(d.quantityUnit)}</div></div>
        <div class="detail-info-row"><i class="fas fa-map-marker-alt"></i><div><strong>Pickup Address</strong>${sanitize(d.pickupAddress || '')}, ${sanitize(d.city || '')}</div></div>
        <div class="detail-info-row"><i class="fas fa-calendar"></i><div><strong>Pickup Date</strong>${d.pickupDate || ''}</div></div>
        <div class="detail-info-row"><i class="fas fa-clock"></i><div><strong>Expires</strong>${expiryLabel(d.expiryTime)}</div></div>
        <div class="detail-info-row"><i class="fas fa-user"></i><div><strong>Donated By</strong>${sanitize(d.donorName || '')}</div></div>
        ${action}
      </div>
    </div>`;
  } catch (e) {
    console.error(e);
    toast('Error loading details.', 'error');
  }
};

window.submitRequest = async function(foodId, donorId, foodName) {
  const btn = document.getElementById('req-btn');
  const qty = parseInt(document.getElementById('req-qty').value);
  const purpose = document.getElementById('req-purpose').value.trim();

  if (!qty || qty < 1) {
    toast('Enter a valid quantity.', 'error');
    return;
  }
  if (!purpose) {
    toast('Please describe your purpose.', 'error');
    return;
  }

  loading(btn, true);

  try {
    await addDoc(collection(db, 'requests'), {
      foodId,
      donorId,
      foodName,
      receiverId: currentUser.uid,
      receiverName: userProfile.fullName,
      receiverPhone: userProfile.phone || '',
      requestedQty: qty,
      purpose,
      status: 'pending',
      createdAt: serverTimestamp()
    });

    // keep donation status as available until donor accepts

    await addDoc(collection(db, 'notifications'), {
      userId: donorId,
      title: 'New Food Request',
      message: `${userProfile.fullName} requested: ${foodName}`,
      type: 'info',
      isRead: false,
      createdAt: serverTimestamp()
    });

    toast('Request submitted! 🙏');
    navigate('my-requests');
  } catch (e) {
    toast(e.message, 'error');
  }

  loading(btn, false);
};

// ── DONATE ───────────────────────────────────────────────────
window.init_donate = function() {
  if (!currentUser) {
    navigate('login');
    return;
  }
  if (userProfile?.role !== 'donor') {
    toast('Only donors can add food.', 'error');
    navigate('dashboard');
    return;
  }
  document.getElementById('don-city').value = userProfile.city || '';
  document.getElementById('don-pickup-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('don-expiry').value = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 16);
};

window.doDonate = async function(e) {
  e.preventDefault();

  const btn = document.getElementById('don-btn');
  const donorPhone = document.getElementById('donorPhone').value;
  const foodName = document.getElementById('don-name').value.trim();
  const foodType = document.getElementById('don-type').value;
  const category = document.getElementById('don-category').value;
  const quantity = parseInt(document.getElementById('don-qty').value);
  const quantityUnit = document.getElementById('don-unit').value;
  const description = document.getElementById('don-desc').value.trim();
  const pickupAddress = document.getElementById('don-address').value.trim();
  const city = document.getElementById('don-city').value.trim();
  const pickupDate = document.getElementById('don-pickup-date').value;
  const expiryStr = document.getElementById('don-expiry').value;
  const imageFile = document.getElementById('don-image').files[0];

  if (!foodName || !city || !pickupAddress || !expiryStr) {
    toast('Please fill all required fields.', 'error');
    return;
  }

  loading(btn, true);

  try {
    let imageUrl = null;
    if (imageFile) {
      try {
        const ref = storageRef(storage, `food/${currentUser.uid}/${Date.now()}_${imageFile.name}`);
        await uploadBytes(ref, imageFile);
        imageUrl = await getDownloadURL(ref);
      } catch {
        toast('Image upload skipped.', 'warning');
      }
    }

    await addDoc(collection(db, 'donations'), {
      donorId: currentUser.uid,
      donorName: userProfile.fullName,
      donorPhone: donorPhone,
      foodName,
      foodType,
      category,
      quantity,
      quantityUnit,
      description,
      pickupAddress,
      city,
      pickupDate,
      expiryTime: new Date(expiryStr),
      imageUrl,
      status: 'available',
      createdAt: serverTimestamp()
    });

    toast('Food listed! ');
    navigate('my-donations');
  } catch (e) {
    toast(e.message, 'error');
  }

  loading(btn, false);
};

window.deleteDonation = async function(id) {
  if (!confirm('Delete this listing?')) return;

  try {
    await deleteDoc(doc(db, 'donations', id));
    toast('Donation deleted.');
    navigate('my-donations');
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ── DASHBOARD ────────────────────────────────────────────────
window.init_dashboard = async function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  await refreshUserProfile();

  document.getElementById('dash-av').textContent = (userProfile.fullName || 'U')[0].toUpperCase();
  document.getElementById('dash-name').textContent = userProfile.fullName || '';
  document.getElementById('dash-role').textContent = userProfile.role || '';

  const role = userProfile.role;

  document.getElementById('dash-donor-section').classList.toggle('hidden', role !== 'donor');
  document.getElementById('dash-receiver-section').classList.toggle('hidden', role !== 'receiver');
  document.getElementById('dash-admin-section').classList.toggle('hidden', role !== 'admin');
  document.getElementById('dash-admin-btn').classList.toggle('hidden', role !== 'admin');
  document.getElementById('dash-donate-btn').classList.toggle('hidden', role !== 'donor');

  if (role === 'donor') await loadDonorDash();
  else if (role === 'receiver') await loadReceiverDash();
  else if (role === 'admin') await loadAdminDashInline();
};

async function loadDonorDash() {
  const uid = currentUser.uid;
  const dS = await getDocs(query(collection(db, 'donations'), where('donorId', '==', uid)));
  const all = dS.docs.map(d => ({ id: d.id, ...d.data() }));

  document.getElementById('d-stat-total').textContent = all.length;
  document.getElementById('d-stat-avail').textContent = all.filter(d => d.status === 'available').length;
  document.getElementById('d-stat-dist').textContent = all.filter(d => d.status === 'distributed').length;

  const rS = await getDocs(query(collection(db, 'requests'), where('donorId', '==', uid), where('status', '==', 'pending')));
  document.getElementById('d-stat-pend').textContent = rS.size;

  const recent = all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 8);
  document.getElementById('d-recent-tbody').innerHTML = recent.length
    ? recent.map(d => `<tr>
      <td><strong>${sanitize(d.foodName)}</strong></td>
      <td>${sanitize(d.quantity)} ${sanitize(d.quantityUnit)}</td>
      <td>${sanitize(d.city || '')}</td>
      <td>${statusBadge(d.status)}</td>
      <td>${expiryLabel(d.expiryTime)}</td>
      <td class="flex gap-2">
        <button class="btn btn-sm btn-secondary" onclick="navigate('food-detail',{id:'${d.id}'})">View</button>
        <button class="btn btn-sm btn-danger" onclick="deleteDonation('${d.id}')">Del</button>
      </td></tr>`).join('')
    : `<tr><td colspan="6" class="empty-row"><p>No donations yet.</p></td></tr>`;

  const pReqs = rS.docs.map(d => ({ id: d.id, ...d.data() }));
  document.getElementById('d-pending-requests').innerHTML = pReqs.length
    ? pReqs.map(r => `<tr>
      <td><strong>${sanitize(r.foodName)}</strong></td>
      <td>${sanitize(r.receiverName)}</td>
      <td>${r.requestedQty}</td>
      <td style="max-width:150px;font-size:.82rem">${sanitize(r.purpose || '')}</td>
      <td>${timeAgo(r.createdAt)}</td>
      <td class="flex gap-2">
        <button class="btn btn-sm btn-primary" onclick="handleRequest('${r.id}','${r.foodId}','${r.receiverId}','accept','${sanitize(r.foodName)}')">✅ Accept</button>
        <button class="btn btn-sm btn-danger" onclick="handleRequest('${r.id}','${r.foodId}','${r.receiverId}','reject','${sanitize(r.foodName)}')">❌ Reject</button>
      </td></tr>`).join('')
    : `<tr><td colspan="6" class="empty-row"><p>No pending requests.</p></td></tr>`;
}

async function loadReceiverDash() {
  const snap = await getDocs(query(collection(db, 'requests'), where('receiverId', '==', currentUser.uid)));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  document.getElementById('r-stat-total').textContent = all.length;
  document.getElementById('r-stat-pend').textContent = all.filter(r => r.status === 'pending').length;
  document.getElementById('r-stat-acc').textContent = all.filter(r => r.status === 'accepted').length;
  document.getElementById('r-stat-done').textContent = all.filter(r => r.status === 'completed').length;

  document.getElementById('r-requests-tbody').innerHTML = all.length
    ? all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(r => `<tr>
      <td><strong>${sanitize(r.foodName)}</strong></td>
      <td>${r.requestedQty}</td>
      <td>${statusBadge(r.status)}</td>
      <td style="font-size:.82rem">${sanitize(r.purpose || '')}</td>
      <td>${timeAgo(r.createdAt)}</td>
      <td>${r.status === 'pending'
        ? `<button class="btn btn-sm btn-danger" onclick="cancelRequest('${r.id}','${r.foodId}')">Cancel</button>`
        : r.status === 'accepted'
          ? `<span style="color:var(--green);font-size:.82rem;font-weight:600">Ready for pickup!</span>`
          : '—'
      }</td></tr>`).join('')
    : `<tr><td colspan="6" class="empty-row"><p>No requests yet. <a onclick="navigate('listings')" style="color:var(--green);cursor:pointer">Browse food</a></p></td></tr>`;
}

// ── ADMIN INLINE DASHBOARD ───────────────────────────────────
async function loadAdminDashInline() {
  try {
    const [uSnap, dSnap, rSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'donations'), orderBy('createdAt', 'desc'))),
      getDocs(collection(db, 'requests'))
    ]);

    const dons = dSnap.docs.map(d => d.data());
    const reqs = rSnap.docs.map(d => d.data());

    document.getElementById('a-stat-users').textContent = uSnap.size;
    document.getElementById('a-stat-dons').textContent = dons.length;
    document.getElementById('a-stat-avail').textContent = dons.filter(d => d.status === 'available').length;
    document.getElementById('a-stat-dist').textContent = dons.filter(d => d.status === 'distributed').length;
    document.getElementById('a-stat-reqs').textContent = reqs.length;
    document.getElementById('a-stat-pend').textContent = reqs.filter(r => r.status === 'pending').length;

    const recentDons = dons.slice(0, 10);
    document.getElementById('a-recent-tbody').innerHTML = recentDons.length
      ? recentDons.map(d => `<tr>
          <td><strong>${sanitize(d.foodName || '')}</strong><br><small style="color:#888">${sanitize(d.category || '')}</small></td>
          <td>${sanitize(d.donorName || '')}</td>
          <td>${sanitize(d.city || '')}</td>
          <td>${statusBadge(d.status)}</td>
          <td style="font-size:.8rem">${d.createdAt ? new Date(d.createdAt.toDate()).toLocaleDateString() : ''}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="empty-row">No donations yet</td></tr>`;

    const recentUsers = uSnap.docs.slice(0, 8).map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('a-recent-users-tbody').innerHTML = recentUsers.length
      ? recentUsers.map(u => `<tr>
          <td><strong>${sanitize(u.fullName || '')}</strong></td>
          <td style="font-size:.82rem">${sanitize(u.email || '')}</td>
          <td><span class="status ${u.role === 'donor' ? 'status-available' : u.role === 'admin' ? 'status-distributed' : 'status-requested'}">${ucfirst(u.role || '')}</span></td>
          <td>${sanitize(u.city || '—')}</td>
          <td><span style="font-size:.75rem;padding:2px 8px;border-radius:999px;background:${u.isActive ? '#DCFCE7' : '#FEE2E2'};color:${u.isActive ? '#166534' : '#991B1B'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
          <td style="font-size:.8rem">${u.createdAt ? new Date(u.createdAt.toDate()).toLocaleDateString() : ''}</td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="empty-row">No users yet</td></tr>`;

    const cats = {};
    dons.forEach(d => {
      const k = d.category || 'other';
      cats[k] = (cats[k] || 0) + 1;
    });

    const maxC = Math.max(...Object.values(cats), 1);
    document.getElementById('a-cat-chart').innerHTML = Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `
        <div class="bar-wrap">
          <div class="bar-val">${v}</div>
          <div class="bar" style="height:${Math.round(v / maxC * 110)}px"></div>
          <div class="bar-lbl">${sanitize(k.slice(0, 7))}</div>
        </div>`).join('');
  } catch (e) {
    console.error('loadAdminDashInline error:', e);
  }
}

// ── HANDLE REQUEST ───────────────────────────────────────────
window.handleRequest = async function(reqId, foodId, receiverId, action, foodName) {
  if (!confirm(`${action === 'accept' ? 'Accept' : 'Reject'} this request?`)) return;

  try {
    const ns = action === 'accept' ? 'accepted' : 'rejected';

    await updateDoc(doc(db, 'requests', reqId), { status: ns });
    await updateDoc(doc(db, 'donations', foodId), { status: action === 'accept' ? 'distributed' : 'available' });

    await addDoc(collection(db, 'notifications'), {
      userId: receiverId,
      title: action === 'accept' ? 'Request Accepted! 🎉' : 'Request Declined',
      message: action === 'accept'
        ? `Your request for "${foodName}" was accepted.`
        : `Your request for "${foodName}" was declined.`,
      type: action === 'accept' ? 'success' : 'warning',
      isRead: false,
      createdAt: serverTimestamp()
    });

    toast(`Request ${ns}.`);
    window.init_dashboard({});
  } catch (e) {
    toast(e.message, 'error');
  }
};

window.cancelRequest = async function(reqId, foodId) {
  if (!confirm('Cancel this request?')) return;

  try {
    await updateDoc(doc(db, 'requests', reqId), { status: 'cancelled' });
    await updateDoc(doc(db, 'donations', foodId), { status: 'available' });
    toast('Request cancelled.');
    window.init_dashboard({});
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ── MY DONATIONS ─────────────────────────────────────────────
window.init_my_donations = async function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  const tbody = document.getElementById('my-don-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Loading...</td></tr>';

  try {
    const snap = await getDocs(
  query(
    collection(db, 'donations'),
    where('donorId', '==', currentUser.uid)
  )
);

const donations = snap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    tbody.innerHTML = snap.empty
      ? `<tr><td colspan="7" class="empty-row"><p>No donations yet. <a style="color:var(--green);cursor:pointer" onclick="navigate('donate')">Add one!</a></p></td></tr>`
      : snap.docs.map(d => {
          const v = d.data();
          return `<tr>
            <td><strong>${sanitize(v.foodName)}</strong><br><small class="text-muted">${sanitize(v.category || '')}</small></td>
            <td>${sanitize(v.quantity)} ${sanitize(v.quantityUnit)}</td>
            <td>${sanitize(v.city || '')}</td>
            <td>${statusBadge(v.status)}</td>
            <td>${expiryLabel(v.expiryTime)}</td>
            <td style="font-size:.8rem">${v.createdAt ? new Date(v.createdAt.toDate()).toLocaleDateString() : ''}</td>
            <td class="flex gap-2">
              <button class="btn btn-sm btn-secondary" onclick="navigate('food-detail',{id:'${d.id}'})">View</button>
              ${v.status === 'available' ? `<button class="btn btn-sm btn-danger" onclick="deleteDonation('${d.id}')">Del</button>` : ''}
            </td></tr>`;
        }).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ── MY REQUESTS ──────────────────────────────────────────────
window.init_my_requests = async function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  const tbody = document.getElementById('my-req-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Loading...</td></tr>';

  try {
    const snap = await getDocs(
      query(
        collection(db, 'requests'),
        where('receiverId', '==', currentUser.uid)
      )
    );

    const requests = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    tbody.innerHTML = requests.length === 0
      ? `<tr><td colspan="6" class="empty-row"><p>No requests yet. <a style="color:var(--green);cursor:pointer" onclick="navigate('listings')">Browse food</a></p></td></tr>`
      : requests.map(r => {
          return `<tr>
            <td><strong>${sanitize(r.foodName)}</strong></td>
            <td>${r.requestedQty}</td>
            <td>${statusBadge(r.status)}</td>
            <td style="font-size:.82rem;max-width:160px">${sanitize(r.purpose || '')}</td>
            <td>${timeAgo(r.createdAt)}</td>
            <td>${r.status === 'pending'
              ? `<button class="btn btn-sm btn-danger" onclick="cancelRequest('${r.id}','${r.foodId}')">Cancel</button>`
              : r.status === 'accepted'
                ? `<span style="color:var(--green);font-size:.82rem;font-weight:600">Ready for pickup!</span>`
                : '—'
            }</td>
          </tr>`;
        }).join('');
  } catch (e) {
    console.error('init_my_requests error:', e);
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Unable to load requests.</td></tr>`;
  }
};

// ── NOTIFICATIONS ────────────────────────────────────────────
window.init_notifications = async function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  const list = document.getElementById('notif-list');
  list.innerHTML = '<p class="text-muted text-center" style="padding:40px">Loading...</p>';

  try {
    const snap = await getDocs(
      query(
        collection(db, 'notifications'),
        where('userId', '==', currentUser.uid)
      )
    );

    const notifications = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 50);

    for (const n of notifications) {
      if (!n.isRead) {
        await updateDoc(doc(db, 'notifications', n.id), { isRead: true });
      }
    }

    document.querySelectorAll('.notif-badge').forEach(b => b.classList.add('hidden'));

    list.innerHTML = notifications.length === 0
      ? '<div class="empty-row"><i class="fas fa-bell-slash"></i><p>No notifications yet.</p></div>'
      : notifications.map(n => {
          const color =
            n.type === 'success'
              ? 'var(--green)'
              : n.type === 'warning'
              ? 'var(--orange)'
              : 'var(--green)';

          return `<div style="background:white;border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;border-left:4px solid ${color}">
            <div>
              <strong>${sanitize(n.title)}</strong>
              <p style="font-size:.87rem;color:var(--mid);margin-top:3px">${sanitize(n.message)}</p>
              <span style="font-size:.75rem;color:var(--muted);margin-top:4px;display:block">${timeAgo(n.createdAt)}</span>
            </div>
          </div>`;
        }).join('');
  } catch (e) {
    console.error('Notifications error:', e);
    list.innerHTML = '<p class="text-muted text-center" style="padding:40px">Unable to load notifications.</p>';
  }
};

async function updateNotifBadge() {
  if (!currentUser) return;

  try {
    const snap = await getDocs(
      query(
        collection(db, 'notifications'),
        where('userId', '==', currentUser.uid)
      )
    );

    const unreadCount = snap.docs.filter(d => !d.data().isRead).length;

    document.querySelectorAll('.notif-badge').forEach(b => {
      b.textContent = unreadCount;
      b.classList.toggle('hidden', unreadCount === 0);
    });
  } catch (e) {
    console.error('updateNotifBadge error:', e);
  }
}
// ── PROFILE ──────────────────────────────────────────────────
window.init_profile = function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  document.getElementById('prof-name').value = userProfile.fullName || '';
  document.getElementById('prof-phone').value = userProfile.phone || '';
  document.getElementById('prof-city').value = userProfile.city || '';
  document.getElementById('prof-addr').value = userProfile.address || '';
  document.getElementById('prof-email').textContent = currentUser.email;
  document.getElementById('prof-role').textContent = userProfile.role || '';
};

window.doUpdateProfile = async function(e) {
  e.preventDefault();

  const btn = document.getElementById('prof-btn');
  const fullName = document.getElementById('prof-name').value.trim();
  const phone = document.getElementById('prof-phone').value.trim();
  const city = document.getElementById('prof-city').value.trim();
  const address = document.getElementById('prof-addr').value.trim();

  loading(btn, true);

  try {
    const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(db, 'users', currentUser.uid), { ...userProfile, fullName, phone, city, address }, { merge: true });
    userProfile = { ...userProfile, fullName, phone, city, address };
    updateNav();
    toast('Profile updated! ✅');
  } catch (e) {
    toast(e.message, 'error');
  }

  loading(btn, false);
};

// ── ADMIN: USERS PAGE ────────────────────────────────────────
window.init_admin_users = async function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  await refreshUserProfile();
  if (userProfile?.role !== 'admin') {
    toast('Access denied.', 'error');
    navigate('home');
    return;
  }

  const tbody = document.getElementById('admin-users-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Loading...</td></tr>';

  try {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
    tbody.innerHTML = snap.empty
      ? `<tr><td colspan="7" class="empty-row">No users found.</td></tr>`
      : snap.docs.map(d => {
          const u = d.data();
          return `<tr>
            <td><strong>${sanitize(u.fullName || '')}</strong></td>
            <td>${sanitize(u.email || '')}</td>
            <td>${sanitize(u.phone || '—')}</td>
            <td><span class="status ${u.role === 'donor' ? 'status-available' : u.role === 'admin' ? 'status-distributed' : 'status-requested'}">${ucfirst(u.role || '')}</span></td>
            <td>${sanitize(u.city || '—')}</td>
            <td><span style="font-size:.78rem;padding:3px 10px;border-radius:999px;background:${u.isActive ? '#DCFCE7' : '#FEE2E2'};color:${u.isActive ? '#166534' : '#991B1B'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
            <td style="font-size:.8rem">${u.createdAt ? new Date(u.createdAt.toDate()).toLocaleDateString() : ''}</td>
          </tr>`;
        }).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ── ADMIN: DONATIONS PAGE ────────────────────────────────────
window.init_admin_donations = async function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  await refreshUserProfile();
  if (userProfile?.role !== 'admin') {
    toast('Access denied.', 'error');
    navigate('home');
    return;
  }

  const tbody = document.getElementById('admin-don-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Loading...</td></tr>';

  try {
    const snap = await getDocs(query(collection(db, 'donations'), orderBy('createdAt', 'desc')));
    tbody.innerHTML = snap.empty
      ? `<tr><td colspan="6" class="empty-row">No donations yet.</td></tr>`
      : snap.docs.map(d => {
          const v = d.data();
          return `<tr>
            <td><strong>${sanitize(v.foodName || '')}</strong><br><small style="color:#888">${sanitize(v.category || '')}</small></td>
            <td>${sanitize(v.donorName || '')}</td>
            <td>${sanitize(v.city || '')}</td>
            <td>${sanitize(v.quantity)} ${sanitize(v.quantityUnit)}</td>
            <td>${statusBadge(v.status)}</td>
            <td style="font-size:.8rem">${v.createdAt ? new Date(v.createdAt.toDate()).toLocaleDateString() : ''}</td>
          </tr>`;
        }).join('');
  } catch (e) {
    console.error(e);
  }
};

// ── ADMIN: REQUESTS PAGE ─────────────────────────────────────
window.init_admin_requests = async function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  await refreshUserProfile();
  if (userProfile?.role !== 'admin') {
    toast('Access denied.', 'error');
    navigate('home');
    return;
  }

  const tbody = document.getElementById('admin-req-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Loading...</td></tr>';

  try {
    const snap = await getDocs(query(collection(db, 'requests'), orderBy('createdAt', 'desc')));
    tbody.innerHTML = snap.empty
      ? `<tr><td colspan="7" class="empty-row">No requests yet.</td></tr>`
      : snap.docs.map(d => {
          const r = d.data();
          return `<tr>
            <td><strong>${sanitize(r.foodName || '')}</strong></td>
            <td>${sanitize(r.donorName || r.donorId || '')}</td>
            <td>${sanitize(r.receiverName || '')}</td>
            <td>${r.requestedQty}</td>
            <td>${statusBadge(r.status)}</td>
            <td style="font-size:.82rem;max-width:140px">${sanitize(r.purpose || '')}</td>
            <td style="font-size:.8rem">${r.createdAt ? new Date(r.createdAt.toDate()).toLocaleString() : ''}</td>
          </tr>`;
        }).join('');
  } catch (e) {
    console.error(e);
  }
};

// ── ADMIN: REPORTS PAGE ──────────────────────────────────────
window.init_admin_reports = async function() {
  if (!currentUser) {
    navigate('login');
    return;
  }

  await refreshUserProfile();
  if (userProfile?.role !== 'admin') {
    toast('Access denied.', 'error');
    navigate('home');
    return;
  }

  try {
    const [donSnap, , usrSnap] = await Promise.all([
      getDocs(collection(db, 'donations')),
      getDocs(collection(db, 'requests')),
      getDocs(collection(db, 'users'))
    ]);

    const dons = donSnap.docs.map(d => d.data());
    const total = dons.length || 1;
    const dist = dons.filter(d => d.status === 'distributed').length;

    document.getElementById('rep-total').textContent = dons.length;
    document.getElementById('rep-dist').textContent = dist;
    document.getElementById('rep-eff').textContent = Math.round(dist / total * 100) + '%';
    document.getElementById('rep-waste').textContent = dons.filter(d => d.status === 'expired').length;
    document.getElementById('rep-donors').textContent = usrSnap.docs.filter(d => d.data().role === 'donor').length;
    document.getElementById('rep-receivers').textContent = usrSnap.docs.filter(d => d.data().role === 'receiver').length;

    const cities = {};
    dons.forEach(d => {
      cities[d.city || 'Unknown'] = (cities[d.city || 'Unknown'] || 0) + 1;
    });

    const maxC = Math.max(...Object.values(cities), 1);
    document.getElementById('rep-city-bars').innerHTML = Object.entries(cities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([city, cnt]) => `
      <div class="prog-item">
        <div class="prog-hdr"><span>${sanitize(city)}</span><span class="fw-6">${cnt}</span></div>
        <div class="prog-bar"><div class="prog-fill" style="width:${Math.round(cnt / maxC * 100)}%"></div></div>
      </div>`).join('');
  } catch (e) {
    console.error(e);
  }
};

// ── NAV WIRING ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  document.querySelector('.hamburger')?.addEventListener('click', () => {
    document.querySelector('.nav-links').classList.toggle('mob');
  });
});
