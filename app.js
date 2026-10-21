// ============================================================
// STATE
// ============================================================
let currentUser = null;
let currentToken = null;
let currentTab = 'dashboard';
let mediaStream = null;
let currentLocation = null;
let currentPhotoData = null;
let clockInterval = null;

let cache = { 
    users: [], attendance: [], leaves: [], overtime: [], settings: {}, 
    departments: [], jabatan: [], tunjangan: [], sk: [], sp: [], cutiBersama: [] 
};

// ============================================================
// API CALL & UTILS
// ============================================================
async function api(action, params = {}) {
    try {
        const body = { action, token: currentToken || CONFIG.API_TOKEN, ...params };
        const res = await fetch(CONFIG.API_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
            body: JSON.stringify(body),
            redirect: 'follow'
        });
        const json = await res.json();
        if (!json.success && json.message === 'Unauthorized') logout();
        return json;
    } catch (err) { 
        console.error('API Error:', err);
        return { success: false, message: 'Koneksi error: ' + err.message }; 
    }
}

async function testConnection() {
    const el = document.getElementById('apiStatus'); 
    if (!el) return;
    el.textContent = '⏳ Menguji API...'; 
    const res = await api('ping');
    el.textContent = res.success ? '✅ API Terhubung' : '❌ Gagal: ' + res.message;
    el.className = 'api-status ' + (res.success ? 'ok' : 'error');
}

function showNotification(msg, type = 'success') {
    const n = document.createElement('div'); 
    n.className = 'notification ' + type; 
    n.textContent = msg;
    document.body.appendChild(n); 
    setTimeout(() => n.remove(), 3000);
}
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'; }
function formatTime(d) { return d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'; }
function formatRupiah(n) { return 'Rp ' + (n || 0).toLocaleString('id-ID'); }
function todayStr() { return new Date().toISOString().split('T')[0]; }

// ============================================================
// AUTH
// ============================================================
async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const role = document.getElementById('loginRole').value;
    const btn = document.getElementById('loginBtn'); 
    btn.disabled = true; btn.textContent = '⏳ Login...';
    
    const res = await api('login', { email, password, role });
    btn.disabled = false; btn.textContent = 'Masuk';
    
    if (res.success) {
        currentUser = res.data.user; 
        currentToken = res.data.token;
        localStorage.setItem('hris_user', JSON.stringify(currentUser)); 
        localStorage.setItem('hris_token', currentToken);
        showNotification('Selamat datang, ' + currentUser.name + '!');
        await loadAllCache(); 
        renderApp();
    } else {
        showNotification(res.message, 'error');
    }
}

function logout() {
    currentUser = null; currentToken = null; clearInterval(clockInterval);
    localStorage.removeItem('hris_user'); localStorage.removeItem('hris_token'); 
    stopCamera(); renderApp();
}

async function checkSession() {
    const sU = localStorage.getItem('hris_user'), sT = localStorage.getItem('hris_token');
    if (sU && sT) { 
        currentUser = JSON.parse(sU); currentToken = sT; 
        await loadAllCache(); renderApp(); 
    } else { 
        document.getElementById('loadingScreen').classList.add('hidden'); 
        document.getElementById('loginScreen').classList.remove('hidden'); 
        testConnection(); 
    }
}

async function loadAllCache() {
    const [u, a, l, o, s, d, j, t, sk, sp, cb] = await Promise.all([
        api('getUsers'), api('getAttendance'), api('getLeaves'), api('getOvertime'), api('getSettings'),
        api('getDepartments'), api('getJabatan'), api('getTunjangan'), api('getSK'), api('getSP'), api('getCutiBersama')
    ]);
    if(u.success) cache.users=u.data || []; 
    if(a.success) cache.attendance=a.data || []; 
    if(l.success) cache.leaves=l.data || [];
    if(o.success) cache.overtime=o.data || []; 
    if(s.success) cache.settings=s.data || {}; 
    if(d.success) cache.departments=d.data || [];
    if(j.success) cache.jabatan=j.data || []; 
    if(t.success) cache.tunjangan=t.data || []; 
    if(sk.success) cache.sk=sk.data || [];
    if(sp.success) cache.sp=sp.data || []; 
    if(cb.success) cache.cutiBersama=cb.data || [];
}

// ============================================================
// RENDER APP & TABS
// ============================================================
function renderApp() {
    document.getElementById('loadingScreen').classList.add('hidden');
    const l = document.getElementById('loginScreen'), d = document.getElementById('dashboardScreen'), ui = document.getElementById('userInfo');
    
    if (currentUser) {
        l.classList.add('hidden'); d.classList.remove('hidden'); ui.classList.remove('hidden');
        document.getElementById('userNameDisplay').textContent = currentUser.name;
        document.getElementById('userRoleDisplay').textContent = currentUser.role.toUpperCase();
        renderTabs(); renderTabContent();
    } else { 
        l.classList.remove('hidden'); d.classList.add('hidden'); ui.classList.add('hidden'); 
    }
}

function getTabsForRole() {
    const t = [{ id: 'dashboard', label: '📊 Dashboard' }, { id: 'absensi', label: '📍 Absensi' }, { id: 'izin', label: '📝 Izin/Cuti' }, { id: 'profil', label: '👤 Profil' }];
    
    const level = String(currentUser.levelJabatan || '').toLowerCase();
    const isSupervisor = currentUser.role === 'atasan' || currentUser.role === 'admin' || level === 'supervisor' || level === 'manager';
    
    if (isSupervisor) {
        t.push({ id: 'team', label: '👥 Tim Saya' });
        t.push({ id: 'approval', label: '✅ Approval' });
    }
    if (currentUser.role === 'admin') {
        t.push({ id: 'karyawan', label: '👥 Karyawan' });
        t.push({ id: 'master', label: '🏢 Master' });
        t.push({ id: 'dokumen', label: '📄 SK & SP' });
        t.push({ id: 'pengaturan', label: '⚙️ Pengaturan' });
        t.push({ id: 'rekap', label: '📈 Rekap Matrix' });
    }
    return t;
}

function renderTabs() {
    const c = document.getElementById('tabsContainer'); const tabs = getTabsForRole();
    if (!tabs.find(t => t.id === currentTab)) currentTab = 'dashboard';
    c.innerHTML = tabs.map(t => `<button class="tab ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
    c.querySelectorAll('.tab').forEach(b => b.onclick = () => { currentTab = b.dataset.tab; renderTabs(); renderTabContent(); });
}

function renderTabContent() {
    clearInterval(clockInterval);
    const c = document.getElementById('tabContent');
    const map = { 
        dashboard: renderDashboard, absensi: renderAbsensi, izin: renderIzin, 
        profil: renderProfil, team: renderTeam, approval: renderApproval, 
        karyawan: renderKaryawan, master: renderMaster, dokumen: renderDokumen, 
        pengaturan: renderPengaturan, rekap: renderRekap 
    };
    const fn = map[currentTab] || renderDashboard;
    try { fn(c); } catch (err) { c.innerHTML = `<div class="card" style="color:red;">Error: ${err.message}</div>`; }
}

// ============================================================
// 1. DASHBOARD
// ============================================================
function renderDashboard(container) {
    const today = todayStr();
    const todayAtt = (cache.attendance || []).filter(a => a.date === today);
    const myAtt = todayAtt.find(a => String(a.userId) === String(currentUser.id));
    
    const settings = cache.settings || {};
    const kuota = Number(settings.cutiTahunan || 12);
    const cutiBersamaCount = (cache.cutiBersama || []).length;
    const approvedLeaves = (cache.leaves || []).filter(l => String(l.userId) === String(currentUser.id) && l.status === 'approved' && l.type !== 'Cuti Bersama');
    let totalCutiPribadi = 0;
    approvedLeaves.forEach(l => {
        const start = new Date(l.startDate), end = new Date(l.endDate);
        totalCutiPribadi += Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    });
    const sisaCuti = Math.max(0, kuota - cutiBersamaCount - totalCutiPribadi);

    container.innerHTML = `
        <div class="clock-container">
            <div class="clock-time" id="liveClock">00:00:00</div>
            <div class="clock-date" id="liveDate"></div>
        </div>
        <div class="dashboard-grid">
            <div>
                <div class="card">
                    <h3>📋 Absensi Hari Ini</h3>
                    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:12px;">
                        <div style="flex:1; background:#f8fafc; padding:16px; border-radius:16px; text-align:center;">
                            <div style="color:#64748b; font-size:0.85rem; margin-bottom:4px;">Check In</div>
                            <div style="font-size:1.5rem; font-weight:800; color:${myAtt && myAtt.checkIn ? '#16a34a' : '#94a3b8'};">
                                ${myAtt && myAtt.checkIn ? formatTime(myAtt.checkIn) : '--:--'}
                            </div>
                        </div>
                        <div style="flex:1; background:#f8fafc; padding:16px; border-radius:16px; text-align:center;">
                            <div style="color:#64748b; font-size:0.85rem; margin-bottom:4px;">Check Out</div>
                            <div style="font-size:1.5rem; font-weight:800; color:${myAtt && myAtt.checkOut ? '#dc2626' : '#94a3b8'};">
                                ${myAtt && myAtt.checkOut ? formatTime(myAtt.checkOut) : '--:--'}
                            </div>
                        </div>
                    </div>
                    <div class="info-box">
                        <strong>ℹ️ Info:</strong> Batas kerja normal adalah <strong>9 jam</strong>. Jika pulang lebih dari 9 jam, otomatis dihitung lembur.
                    </div>
                    <button class="btn btn-primary btn-full" style="margin-top:12px;" onclick="currentTab='absensi';renderTabs();renderTabContent();">📍 Ke Halaman Absensi</button>
                </div>
            </div>
            <div>
                <div class="leave-card">
                    <h3>🏖️ Sisa Cuti Anda</h3>
                    <div class="leave-number">${sisaCuti}</div>
                    <div style="color: #64748b; font-size: 0.85rem;">Hari Tersisa</div>
                </div>
            </div>
        </div>
    `;

    clockInterval = setInterval(() => {
        const now = new Date();
        const clock = document.getElementById('liveClock');
        const dt = document.getElementById('liveDate');
        if (clock) clock.textContent = now.toLocaleTimeString('id-ID');
        if (dt) dt.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }, 1000);
}

// ============================================================
// 2. ABSENSI & LEMBUR
// ============================================================
function renderAbsensi(container) {
    const today = todayStr();
    const rec = (cache.attendance || []).find(a => String(a.userId) === String(currentUser.id) && a.date === today);
    const hasIn = rec && rec.checkIn;
    const hasOut = rec && rec.checkOut;
    
    container.innerHTML = `
        <div class="dashboard-grid">
            <div>
                <div class="card">
                    <h3>📍 Absensi</h3>
                    <div class="location-status"><span>📡</span><span id="locationText">Mendeteksi lokasi...</span></div>
                    <video id="video" autoplay playsinline></video>
                    <canvas id="canvas" class="hidden"></canvas>
                    <div class="photo-preview" id="photoPreview"></div>
                    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" id="startCameraBtn" ${hasIn ? 'disabled' : ''}>🎥 Kamera</button>
                        <button class="btn btn-success btn-sm" id="captureBtn" disabled>📸 Ambil Foto</button>
                    </div>
                    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
                        <button class="btn btn-primary" id="checkInBtn" ${hasIn ? 'disabled' : ''} style="flex:1;">
                            ${hasIn ? '🔒 Sudah Check In' : '🟢 Check In'}
                        </button>
                        <button class="btn btn-danger" id="checkOutBtn" ${!hasIn || hasOut ? 'disabled' : ''} style="flex:1;">
                            ${hasOut ? '🔒 Sudah Check Out' : '🔴 Check Out'}
                        </button>
                    </div>
                </div>
            </div>
            <div>
                <div class="card">
                    <h3>🕒 Pengajuan Lembur</h3>
                    <div class="form-group"><label>Tanggal (Min. Hari Ini)</label><input type="date" id="otDate" value="${today}" min="${today}"></div>
                    <div class="form-group"><label>Jam Mulai</label><input type="time" id="otStart"></div>
                    <div class="form-group"><label>Jam Selesai</label><input type="time" id="otEnd"></div>
                    <div class="form-group"><label>Alasan</label><input id="otReason" placeholder="Alasan lembur"></div>
                    <button class="btn btn-warning btn-full" onclick="submitOvertime()">📤 Ajukan Lembur</button>
                </div>
            </div>
        </div>
    `;
    detectLocation();
    document.getElementById('startCameraBtn').onclick = startCamera;
    document.getElementById('captureBtn').onclick = capturePhoto;
    document.getElementById('checkInBtn').onclick = () => handleCheck('in');
    document.getElementById('checkOutBtn').onclick = () => handleCheck('out');
}

function detectLocation() {
    const t = document.getElementById('locationText'); if (!t) return;
    if (!navigator.geolocation) { t.textContent = '❌ Geolocation tidak didukung'; return; }
    navigator.geolocation.getCurrentPosition(
        p => { currentLocation = { lat: p.coords.latitude, lng: p.coords.longitude }; t.textContent = `✅ ${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`; }, 
        e => { t.textContent = '⚠️ ' + e.message; }, 
        { enableHighAccuracy: true }
    );
}
function startCamera() { 
    if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(s => { 
            mediaStream = s; document.getElementById('video').srcObject = s; document.getElementById('captureBtn').disabled = false; 
        }).catch(e => showNotification('Kamera error: ' + e.message, 'error')); 
    }
}
function stopCamera() { if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; } }
function capturePhoto() { 
    const v = document.getElementById('video'), c = document.getElementById('canvas'); 
    if (!v.srcObject) return showNotification('Nyalakan kamera dulu', 'error');
    c.width = v.videoWidth || 320; c.height = v.videoHeight || 240; 
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); 
    currentPhotoData = c.toDataURL('image/jpeg', 0.7); 
    document.getElementById('photoPreview').innerHTML = `<img src="${currentPhotoData}">`; 
    stopCamera(); showNotification('Foto diambil!'); 
}

async function handleCheck(type) {
    if (type === 'in' && !currentPhotoData) return showNotification('Ambil foto dulu!', 'error');
    const btn = document.getElementById(type === 'in' ? 'checkInBtn' : 'checkOutBtn');
    btn.disabled = true; btn.textContent = '⏳ Memproses...';
    const res = await api(type === 'in' ? 'checkIn' : 'checkOut', {
        userId: currentUser.id, userName: currentUser.name,
        locationLat: currentLocation?.lat, locationLng: currentLocation?.lng, photo: currentPhotoData
    });
    if (res.success) { 
        showNotification(`✅ ${type === 'in' ? 'Check In' : 'Check Out'} berhasil!`); 
        currentPhotoData = null; await loadAllCache(); renderTabContent(); 
    } else { 
        showNotification(res.message, 'error'); 
        btn.disabled = false; btn.textContent = type === 'in' ? '🟢 Check In' : '🔴 Check Out'; 
    }
}

async function submitOvertime() {
    const date = document.getElementById('otDate').value;
    const startTime = document.getElementById('otStart').value;
    const endTime = document.getElementById('otEnd').value;
    const reason = document.getElementById('otReason').value.trim();
    
    const today = todayStr();
    if (date < today) return showNotification('Tanggal tidak boleh sebelum hari ini!', 'error');
    if (!date || !startTime || !endTime || !reason) return showNotification('Lengkapi data!', 'error');
    
    const res = await api('createOvertime', { data: { userId: currentUser.id, userName: currentUser.name, date, startTime, endTime, reason, status: 'pending' } });
    if (res.success) { showNotification('✅ Lembur diajukan'); await loadAllCache(); renderTabContent(); } 
    else showNotification(res.message, 'error');
}

// ============================================================
// 3. IZIN / CUTI
// ============================================================
function renderIzin(container) {
    const leaves = (cache.leaves || []).filter(l => String(l.userId) === String(currentUser.id));
    const today = todayStr();
    
    container.innerHTML = `
        <div class="dashboard-grid">
            <div>
                <div class="card">
                    <h3>📝 Ajukan Izin/Cuti</h3>
                    <div class="form-group"><label>Jenis</label>
                        <select id="izinType"><option>Cuti Tahunan</option><option>Sakit</option><option>Izin Pribadi</option><option>Dinas Luar</option></select>
                    </div>
                    <div class="form-group"><label>Mulai</label><input type="date" id="izinStart" value="${today}" min="${today}"></div>
                    <div class="form-group"><label>Selesai</label><input type="date" id="izinEnd" value="${today}" min="${today}"></div>
                    <div class="form-group"><label>Alasan</label><textarea id="izinReason" rows="3"></textarea></div>
                    <button class="btn btn-primary btn-full" id="ajukanBtn">📤 Ajukan</button>
                </div>
            </div>
            <div>
                <div class="card">
                    <h3>📋 Riwayat</h3>
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Jenis</th><th>Tanggal</th><th>Status</th></tr></thead>
                            <tbody>${leaves.map(l => `
                                <tr><td>${l.type}</td><td>${formatDate(l.startDate)} - ${formatDate(l.endDate)}</td>
                                <td><span class="status-badge status-${l.status}">${l.status}</span></td></tr>
                            `).join('') || '<tr><td colspan="3" class="empty-state">Belum ada</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('ajukanBtn').onclick = async () => {
        const type = document.getElementById('izinType').value;
        const startDate = document.getElementById('izinStart').value;
        const endDate = document.getElementById('izinEnd').value;
        const reason = document.getElementById('izinReason').value.trim();
        
        if (startDate < today) return showNotification('Tidak bisa backdate!', 'error');
        if (!startDate || !endDate || !reason) return showNotification('Lengkapi!', 'error');
        
        const res = await api('createLeave', { userId: currentUser.id, userName: currentUser.name, type, startDate, endDate, reason });
        if (res.success) { showNotification('✅ Izin diajukan'); await loadAllCache(); renderTabContent(); } 
        else showNotification(res.message, 'error');
    };
}

// ============================================================
// 4. PROFIL
// ============================================================
function renderProfil(container) {
    const tunj = (cache.tunjangan || []).filter(t => String(t.userId) === String(currentUser.id));
    const initials = (currentUser.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="card">
                <div class="avatar">${initials}</div>
                <h3 style="justify-content:center;">${currentUser.name}</h3>
                <p style="text-align:center;color:#64748b;margin-bottom:16px;">${currentUser.jabatan || '-'} · ${currentUser.department || '-'}</p>
                <div class="info-row"><span class="info-label">Email</span><span class="info-value">${currentUser.email}</span></div>
                <div class="info-row"><span class="info-label">Level Jabatan</span><span class="info-value">${currentUser.levelJabatan || '-'}</span></div>
            </div>
        </div>
    `;
}

// ============================================================
// 5. TEAM VIEW (POIN 3)
// ============================================================
function renderTeam(container) {
    const today = todayStr();
    const myDept = currentUser.department;
    const teamMembers = cache.users.filter(u => u.department === myDept && String(u.id) !== String(currentUser.id));
    const teamAtt = cache.attendance.filter(a => a.date === today && teamMembers.some(m => String(m.id) === String(a.userId)));

    container.innerHTML = `
        <div class="card">
            <h3>👥 Absensi Tim (${myDept}) Hari Ini</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Nama</th><th>Jabatan</th><th>Check In</th><th>Check Out</th><th>Status</th></tr></thead>
                    <tbody>
                        ${teamMembers.map(m => {
                            const rec = teamAtt.find(a => String(a.userId) === String(m.id));
                            return `<tr>
                                <td><strong>${m.name}</strong></td>
                                <td>${m.jabatan || '-'}</td>
                                <td>${rec && rec.checkIn ? formatTime(rec.checkIn) : '-'}</td>
                                <td>${rec && rec.checkOut ? formatTime(rec.checkOut) : '-'}</td>
                                <td>${rec ? '<span class="badge badge-success">Hadir</span>' : '<span class="badge badge-danger">Belum Absen</span>'}</td>
                            </tr>`;
                        }).join('') || '<tr><td colspan="5" class="empty-state">Tidak ada anggota tim</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ============================================================
// 6. APPROVAL
// ============================================================
function renderApproval(container) {
    const allLeaves = (cache.leaves || []).slice().reverse();
    container.innerHTML = `
        <div class="card">
            <h3>✅ Approval Izin/Cuti</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Karyawan</th><th>Jenis</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead>
                    <tbody>${allLeaves.map(l => `<tr>
                        <td><strong>${l.userName}</strong></td><td>${l.type}</td>
                        <td>${formatDate(l.startDate)} - ${formatDate(l.endDate)}</td>
                        <td><span class="status-badge status-${l.status}">${l.status}</span></td>
                        <td>${l.status === 'pending' ? `
                            <div class="action-buttons">
                                <button class="btn btn-success btn-sm" onclick="approveLeave(${l.id}, 'approved')">✅</button>
                                <button class="btn btn-danger btn-sm" onclick="approveLeave(${l.id}, 'rejected')">❌</button>
                            </div>` : '-'}</td>
                    </tr>`).join('') || '<tr><td colspan="5" class="empty-state">Tidak ada</td></tr>'}</tbody>
                </table>
            </div>
        </div>
    `;
}
async function approveLeave(id, status) {
    const res = await api('approveLeave', { id, status, approverName: currentUser.name });
    if (res.success) { showNotification(`Izin ${status}`); await loadAllCache(); renderTabContent(); } 
    else showNotification(res.message, 'error');
}

// ============================================================
// 7. KARYAWAN (Admin)
// ============================================================
function renderKaryawan(container) {
    container.innerHTML = `
        <div class="card">
            <h3>👥 Daftar Karyawan</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Nama</th><th>Jabatan</th><th>Role</th></tr></thead>
                    <tbody>${(cache.users || []).map(u => `<tr>
                        <td><strong>${u.name}</strong></td><td>${u.jabatan || '-'}</td>
                        <td><span class="badge badge-info">${u.role}</span></td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderMaster(container) {
    container.innerHTML = `<div class="card"><h3>🏢 Master Data</h3><p style="color:#64748b;">Menu master data (Departemen, Jabatan, Tunjangan).</p></div>`;
}
function renderDokumen(container) {
    container.innerHTML = `<div class="card"><h3>📄 SK & SP</h3><p style="color:#64748b;">Menu dokumen.</p></div>`;
}
function renderPengaturan(container) {
    container.innerHTML = `<div class="card"><h3>⚙️ Pengaturan</h3><p style="color:#64748b;">Menu pengaturan.</p></div>`;
}

// ============================================================
// 8. REKAP MATRIX (Update: Warna Weekend, Print PDF, Excel)
// ============================================================
function renderRekap(container) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    container.innerHTML = `
        <div class="card">
            <h3>📈 Rekap Matrix Kehadiran</h3>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
                <div class="form-group" style="flex:1;min-width:140px;margin-bottom:0;">
                    <label>Dari</label><input type="date" id="rekapStart" value="${start}">
                </div>
                <div class="form-group" style="flex:1;min-width:140px;margin-bottom:0;">
                    <label>Sampai</label><input type="date" id="rekapEnd" value="${end}">
                </div>
                <button type="button" class="btn btn-primary" id="btnTampilkanRekap">📊 Tampilkan</button>
                <button type="button" class="btn btn-success" id="btnCetakPDF" disabled>🖨️ Cetak PDF</button>
                <button type="button" class="btn btn-secondary" id="btnExportExcel" disabled>📥 Export Excel</button>
            </div>
            <div style="margin-top: 10px; font-size: 0.8rem; color: #475569;">
                <strong>Keterangan:</strong> 
                <span class="badge badge-success">H</span> Hadir &nbsp;
                <span class="badge badge-info">W</span> WFH &nbsp;
                <span class="badge badge-warning">C</span> Cuti &nbsp;
                <span class="badge" style="background:#e0e7ff;color:#1e40af;">D</span> Dinas &nbsp;
                <span class="badge" style="background:#fce7f3;color:#991b1b;">S</span> Sakit &nbsp;
                <span class="badge badge-danger">A</span> Alpha
            </div>
        </div>
        <div id="rekapResult" style="overflow-x: auto;">
            <div class="empty-state">Klik tombol "Tampilkan" untuk memuat data.</div>
        </div>
    `;

    document.getElementById('btnTampilkanRekap').onclick = function() { generateRekap(); };
    
    // Tombol Print PDF
    document.getElementById('btnCetakPDF').onclick = function() { 
        window.print(); 
    };

    // Tombol Export Excel
    document.getElementById('btnExportExcel').onclick = function() { 
        exportToExcel();
    };
}

async function generateRekap() {
    const startDate = document.getElementById('rekapStart').value;
    const endDate = document.getElementById('rekapEnd').value;
    const resultDiv = document.getElementById('rekapResult');
    const btnPdf = document.getElementById('btnCetakPDF');
    const btnExcel = document.getElementById('btnExportExcel');
    
    if (!startDate || !endDate) return showNotification('Pilih tanggal mulai dan selesai!', 'error');

    resultDiv.innerHTML = '<div class="empty-state">⏳ Memuat data rekap...</div>';

    try {
        const res = await api('getRekap', { startDate, endDate });
        
        if (!res.success) {
            resultDiv.innerHTML = `<div class="empty-state" style="color:red;">Gagal: ${res.message}</div>`;
            return;
        }
        
        const { tanggalKerja, matrix } = res.data;
        
        if (!tanggalKerja || tanggalKerja.length === 0) {
            resultDiv.innerHTML = '<div class="empty-state">Tidak ada hari kerja pada periode ini.</div>';
            return;
        }

        // Simpan data ke global untuk keperluan export excel
        window.lastRekapData = { tanggalKerja, matrix };

        // Bangun Header
        let headerHtml = '<th style="position:sticky; left:0; background:#f1f5f9; z-index:2; min-width:150px;">Nama Karyawan</th>';
        tanggalKerja.forEach(tgl => {
            const d = new Date(tgl);
            const dayName = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()];
            const dateNum = d.getDate();
            
            // Tentukan warna header (Sabtu=3 biru muda, Minggu=0 merah muda)
            let bgColor = '#f1f5f9';
            if (d.getDay() === 6) bgColor = '#e0f2fe'; // Sabtu (Biru Langit)
            else if (d.getDay() === 0) bgColor = '#fce7f3'; // Minggu (Pink)

            headerHtml += `<th style="text-align:center; min-width:35px; padding:4px; background:${bgColor};" title="${tgl}">${dayName}<br>${dateNum}</th>`;
        });

        // Bangun Body
        let bodyHtml = '';
        matrix.forEach(row => {
            let rowHtml = `<td style="position:sticky; left:0; background:white; z-index:1; font-weight:600;">${row.userName}<br><span style="font-size:0.7rem; font-weight:normal; color:#64748b;">${row.jabatan || '-'}</span></td>`;
            
            tanggalKerja.forEach(tgl => {
                const d = new Date(tgl);
                const status = row.statusHarian[tgl] || '-';
                
                let bgStatus = '#f1f5f9';
                let textColor = '#1e293b';
                if (status === 'H') { bgStatus = '#d1fae5'; textColor = '#065f46'; }
                else if (status === 'W') { bgStatus = '#dbeafe'; textColor = '#1e40af'; }
                else if (status === 'C') { bgStatus = '#fef3c7'; textColor = '#92400e'; }
                else if (status === 'D') { bgStatus = '#e0e7ff'; textColor = '#1e40af'; }
                else if (status === 'S') { bgStatus = '#fce7f3'; textColor = '#991b1b'; }
                else if (status === 'A') { bgStatus = '#fee2e2'; textColor = '#991b1b'; }

                // Tentukan background SEL (jika kosong/tidak ada status, beri warna weekend)
                let cellBg = 'transparent';
                if (status === '-') {
                    if (d.getDay() === 6) cellBg = '#f0f9ff'; // Sabtu
                    else if (d.getDay() === 0) cellBg = '#fdf2f8'; // Minggu
                }

                rowHtml += `<td style="text-align:center; padding:6px 4px; background:${cellBg};">
                    <span style="display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; font-size:0.75rem; font-weight:700; background:${bgStatus}; color:${textColor};">${status}</span>
                </td>`;
            });
            bodyHtml += `<tr>${rowHtml}</tr>`;
        });

        resultDiv.innerHTML = `
            <div class="card" style="padding:0; overflow:hidden;">
                <div style="padding: 10px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                    <strong>Periode:</strong> ${formatDate(startDate)} - ${formatDate(endDate)}
                </div>
                <div class="table-container" style="border:none; margin:0;">
                    <table style="border-collapse: separate; border-spacing: 0; min-width: 100%;">
                        <thead><tr>${headerHtml}</tr></thead>
                        <tbody>${bodyHtml || '<tr><td colspan="100" class="empty-state">Belum ada data</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        `;

        // Aktifkan tombol export
        btnPdf.disabled = false;
        btnExcel.disabled = false;

    } catch (err) {
        console.error(err);
        resultDiv.innerHTML = `<div class="empty-state" style="color:red;">Error Sistem: ${err.message}</div>`;
    }
}

// ============================================================
// FUNGSI EXPORT EXCEL
// ============================================================
function exportToExcel() {
    if (!window.lastRekapData) return showNotification('Tampilkan data terlebih dahulu!', 'error');
    
    const { tanggalKerja, matrix } = window.lastRekapData;
    const dataExcel = [];

    // Header Baris 1: Tanggal & Hari
    const row1 = ['Nama Karyawan', 'Jabatan'];
    const row2 = ['', '']; 
    tanggalKerja.forEach(tgl => {
        const d = new Date(tgl);
        const dayName = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()];
        row1.push(tgl); 
        row2.push(dayName);
    });
    dataExcel.push(row1);
    dataExcel.push(row2);

    // Isi Data
    matrix.forEach(row => {
        const dataRow = [row.userName, row.jabatan || '-'];
        tanggalKerja.forEach(tgl => {
            dataRow.push(row.statusHarian[tgl] || '-');
        });
        dataExcel.push(dataRow);
    });

    // Buat Workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dataExcel);

    // Set lebar kolom (otomatis)
    const wscols = [{ wch: 25 }, { wch: 20 }];
    for (let i = 0; i < tanggalKerja.length; i++) wscols.push({ wch: 5 });
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absensi');
    XLSX.writeFile(wb, `Rekap_Absensi_${todayStr()}.xlsx`);
    
    showNotification('📥 File Excel berhasil diunduh!');
}

// ============================================================
// START
// ============================================================
document.getElementById('loginBtn').onclick = doLogin;
document.getElementById('loginPassword').addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('logoutBtn').onclick = logout;
window.addEventListener('beforeunload', stopCamera);

checkSession();
