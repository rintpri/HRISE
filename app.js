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

// Cache untuk menyimpan data dari API
let cache = { 
    users: [], attendance: [], leaves: [], overtime: [], settings: {}, 
    departments: [], jabatan: [], tunjangan: [], sk: [], sp: [], cutiBersama: [] 
};

// ============================================================
// API CALL
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

// ============================================================
// UTILS
// ============================================================
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
    const t = [{ id: 'dashboard', label: '📊 Dashboard' }, { id: 'absensi', label: '📍 Absensi & Lembur' }, { id: 'izin', label: '📝 Izin/Cuti' }, { id: 'profil', label: '👤 Profil' }];
    if (['atasan', 'admin'].includes(currentUser.role)) t.push({ id: 'approval', label: '✅ Approval' });
    if (currentUser.role === 'admin') {
        t.push({ id: 'karyawan', label: '👥 Karyawan' }, { id: 'master', label: '🏢 Master' }, { id: 'dokumen', label: '📄 SK & SP' }, { id: 'pengaturan', label: '⚙️ Pengaturan' }, { id: 'rekap', label: '📈 Rekap' });
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
        profil: renderProfil, approval: renderApproval, karyawan: renderKaryawan, 
        master: renderMaster, dokumen: renderDokumen, pengaturan: renderPengaturan, rekap: renderRekap 
    };
    const fn = map[currentTab] || renderDashboard;
    try {
        fn(c);
    } catch (err) {
        console.error('Render error:', err);
        c.innerHTML = `<div class="card" style="color:red;">Error memuat halaman: ${err.message}</div>`;
    }
}

// ============================================================
// 1. DASHBOARD (Jam Berjalan, Absen Hari Ini, Sisa Cuti)
// ============================================================
function renderDashboard(container) {
    const today = todayStr();
    const todayAtt = cache.attendance.filter(a => a.date === today);
    const myAtt = todayAtt.find(a => String(a.userId) === String(currentUser.id));
    
    // Kalkulasi Sisa Cuti
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
                        <strong>ℹ️ Info:</strong> Batas kerja normal adalah <strong>9 jam</strong>. Jika pulang lebih dari 9 jam, otomatis dihitung lembur. Wajib ajukan Lembur & Approval Atasan jika bekerja di hari libur.
                    </div>
                    <button class="btn btn-primary btn-full" style="margin-top:12px;" onclick="currentTab='absensi';renderTabs();renderTabContent();">📍 Ke Halaman Absensi</button>
                </div>
            </div>
            <div>
                <div class="leave-card">
                    <h3>🏖️ Sisa Cuti Anda</h3>
                    <div class="leave-number">${sisaCuti}</div>
                    <div style="color: #64748b; font-size: 0.85rem;">Hari Tersisa</div>
                    <div style="margin-top: 16px; font-size: 0.8rem; color: #94a3b8; text-align: left; border-top:1px dashed #e2e8f0; padding-top:12px;">
                        Kuota Tahunan: <strong>${kuota} hari</strong><br>
                        Cuti Bersama: <strong>-${cutiBersamaCount} hari</strong><br>
                        Cuti Disetujui: <strong>-${totalCutiPribadi} hari</strong>
                    </div>
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
                    <div class="camera-status"><span>📷</span><span>Ambil selfie</span></div>
                    <video id="video" autoplay playsinline></video>
                    <canvas id="canvas" class="hidden"></canvas>
                    <div class="photo-preview" id="photoPreview"></div>
                    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" id="startCameraBtn">🎥 Kamera</button>
                        <button class="btn btn-success btn-sm" id="captureBtn" disabled>📸 Ambil Foto</button>
                    </div>
                    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
                        <button class="btn btn-primary" id="checkInBtn" ${hasIn ? 'disabled' : ''} style="flex:1;">${hasIn ? '✅ Sudah Check In' : '🟢 Check In'}</button>
                        <button class="btn btn-danger" id="checkOutBtn" ${!hasIn || hasOut ? 'disabled' : ''} style="flex:1;">${hasOut ? '✅ Sudah Check Out' : '🔴 Check Out'}</button>
                    </div>
                    ${hasIn && !hasOut ? `<div style="margin-top:12px; text-align:center; font-size:0.8rem; color:#d97706;">⚠️ Check Out baru bisa dilakukan setelah 9 jam kerja.</div>` : ''}
                </div>
            </div>
            <div>
                <div class="card">
                    <h3>🕒 Pengajuan Lembur</h3>
                    <div class="form-group"><label>Tanggal</label><input type="date" id="otDate" value="${today}"></div>
                    <div class="form-group"><label>Jam Mulai</label><input type="time" id="otStart"></div>
                    <div class="form-group"><label>Jam Selesai</label><input type="time" id="otEnd"></div>
                    <div class="form-group"><label>Alasan</label><input id="otReason" placeholder="Alasan lembur"></div>
                    <button class="btn btn-warning btn-full" onclick="submitOvertime()">📤 Ajukan Lembur</button>
                </div>
                <div class="card">
                    <h3>📋 Riwayat Lembur</h3>
                    <div class="table-container"><table>
                        <thead><tr><th>Tanggal</th><th>Waktu</th><th>Status</th></tr></thead>
                        <tbody>
                            ${(cache.overtime || []).filter(o => String(o.userId) === String(currentUser.id)).map(o => `
                                <tr><td>${formatDate(o.date)}</td><td>${o.startTime}-${o.endTime}</td><td><span class="status-badge status-${o.status}">${o.status}</span></td></tr>
                            `).join('') || '<tr><td colspan="3" class="empty-state">Belum ada</td></tr>'}
                        </tbody>
                    </table></div>
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
        }).catch(e => showNotification('Kamera error', 'error')); 
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
    if (!date || !startTime || !endTime || !reason) return showNotification('Lengkapi data!', 'error');
    
    const res = await api('createOvertime', {
        data: { userId: currentUser.id, userName: currentUser.name, date, startTime, endTime, reason, status: 'pending' }
    });
    if (res.success) { showNotification('✅ Lembur diajukan'); await loadAllCache(); renderTabContent(); }
    else showNotification(res.message, 'error');
}

// ============================================================
// 3. IZIN / CUTI
// ============================================================
function renderIzin(container) {
    const leaves = (cache.leaves || []).filter(l => String(l.userId) === String(currentUser.id));
    container.innerHTML = `
        <div class="dashboard-grid">
            <div>
                <div class="card">
                    <h3>📝 Ajukan Izin/Cuti</h3>
                    <div class="form-group"><label>Jenis</label>
                        <select id="izinType"><option>Cuti Tahunan</option><option>Sakit</option><option>Izin Pribadi</option><option>Dinas Luar</option></select>
                    </div>
                    <div class="form-group"><label>Mulai</label><input type="date" id="izinStart" value="${todayStr()}"></div>
                    <div class="form-group"><label>Selesai</label><input type="date" id="izinEnd" value="${todayStr()}"></div>
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
                <div class="card">
                    <h3>🎉 Cuti Bersama</h3>
                    <div class="table-container">
                        <table><thead><tr><th>Tanggal</th><th>Keterangan</th></tr></thead>
                            <tbody>${(cache.cutiBersama || []).map(c => `<tr><td>${formatDate(c.tanggal)}</td><td>${c.keterangan}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">-</td></tr>'}</tbody>
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
    const totalTunj = tunj.reduce((s, t) => s + Number(t.jumlah || 0), 0);
    const sk = (cache.sk || []).filter(s => String(s.userId) === String(currentUser.id));
    const sp = (cache.sp || []).filter(s => String(s.userId) === String(currentUser.id));
    const initials = (currentUser.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    const settings = cache.settings || {};
    const kuota = Number(settings.cutiTahunan || 12);
    const cutiBersamaCount = (cache.cutiBersama || []).length;
    const approvedLeaves = (cache.leaves || []).filter(l => String(l.userId) === String(currentUser.id) && l.status === 'approved');
    let totalCutiPribadi = 0;
    approvedLeaves.forEach(l => { totalCutiPribadi += Math.ceil((new Date(l.endDate) - new Date(l.startDate)) / (1000*60*60*24)) + 1; });
    const sisaCuti = Math.max(0, kuota - cutiBersamaCount - totalCutiPribadi);

    container.innerHTML = `
        <div class="dashboard-grid">
            <div>
                <div class="card">
                    <div class="avatar">${initials}</div>
                    <h3 style="justify-content:center;">${currentUser.name}</h3>
                    <p style="text-align:center;color:#64748b;margin-bottom:16px;">${currentUser.jabatan || '-'} · ${currentUser.department || '-'}</p>
                    <div class="info-row"><span class="info-label">Email</span><span class="info-value">${currentUser.email}</span></div>
                    <div class="info-row"><span class="info-label">Telepon</span><span class="info-value">${currentUser.phone || '-'}</span></div>
                    <div class="info-row"><span class="info-label">Alamat</span><span class="info-value">${currentUser.address || '-'}</span></div>
                    <div class="info-row"><span class="info-label">Join Date</span><span class="info-value">${formatDate(currentUser.joinDate)}</span></div>
                    <div class="info-row"><span class="info-label">Gaji Pokok</span><span class="info-value">${formatRupiah(currentUser.gaji)}</span></div>
                    <div class="info-row"><span class="info-label">Total Tunjangan</span><span class="info-value">${formatRupiah(totalTunj)}</span></div>
                    <div class="info-row" style="background:#eff6ff; padding:12px; border-radius:8px; margin-top:12px;">
                        <span class="info-label" style="font-weight:bold;">Sisa Cuti (Tahun Ini)</span>
                        <span class="info-value" style="font-size:1.3rem; color:#2563eb;">${sisaCuti} Hari</span>
                    </div>
                </div>
            </div>
            <div>
                <div class="card">
                    <h3>💰 Tunjangan</h3>
                    <div class="table-container"><table>
                        <thead><tr><th>Nama</th><th>Jumlah</th></tr></thead>
                        <tbody>${tunj.map(t => `<tr><td>${t.nama}</td><td>${formatRupiah(t.jumlah)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">-</td></tr>'}</tbody>
                    </table></div>
                </div>
                <div class="card">
                    <h3>📄 SK</h3>
                    <div class="table-container"><table>
                        <thead><tr><th>Nomor</th><th>Tanggal</th></tr></thead>
                        <tbody>${sk.map(s => `<tr><td>${s.nomor}</td><td>${formatDate(s.tanggal)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">-</td></tr>'}</tbody>
                    </table></div>
                </div>
                <div class="card">
                    <h3>⚠️ SP</h3>
                    <div class="table-container"><table>
                        <thead><tr><th>Level</th><th>Tanggal</th></tr></thead>
                        <tbody>${sp.map(s => `<tr><td>${s.level}</td><td>${formatDate(s.tanggal)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">Tidak ada 🎉</td></tr>'}</tbody>
                    </table></div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// 5. APPROVAL (Atasan/Admin)
// ============================================================
function renderApproval(container) {
    const allLeaves = (cache.leaves || []).slice().reverse();
    const allOvertime = (cache.overtime || []).slice().reverse();
    
    container.innerHTML = `
        <div class="card">
            <h3>✅ Approval Izin/Cuti</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Karyawan</th><th>Jenis</th><th>Tanggal</th><th>Alasan</th><th>Status</th><th>Aksi</th></tr></thead>
                    <tbody>${allLeaves.map(l => `<tr>
                        <td><strong>${l.userName}</strong></td><td>${l.type}</td>
                        <td>${formatDate(l.startDate)} - ${formatDate(l.endDate)}</td>
                        <td>${l.reason}</td>
                        <td><span class="status-badge status-${l.status}">${l.status}</span></td>
                        <td>${l.status === 'pending' ? `
                            <div class="action-buttons">
                                <button class="btn btn-success btn-sm" onclick="approveLeave(${l.id}, 'approved')">✅</button>
                                <button class="btn btn-danger btn-sm" onclick="approveLeave(${l.id}, 'rejected')">❌</button>
                            </div>` : '<span style="color:#94a3b8;font-size:0.75rem;">' + (l.approvedBy || '-') + '</span>'}</td>
                    </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Tidak ada</td></tr>'}</tbody>
                </table>
            </div>
        </div>
        
        <div class="card">
            <h3>🕒 Approval Lembur</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Karyawan</th><th>Tanggal</th><th>Waktu</th><th>Alasan</th><th>Status</th><th>Aksi</th></tr></thead>
                    <tbody>${allOvertime.map(o => `<tr>
                        <td><strong>${o.userName}</strong></td><td>${formatDate(o.date)}</td>
                        <td>${o.startTime} - ${o.endTime}</td>
                        <td>${o.reason}</td>
                        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
                        <td>${o.status === 'pending' ? `
                            <div class="action-buttons">
                                <button class="btn btn-success btn-sm" onclick="approveOvertime(${o.id}, 'approved')">✅</button>
                                <button class="btn btn-danger btn-sm" onclick="approveOvertime(${o.id}, 'rejected')">❌</button>
                            </div>` : '<span style="color:#94a3b8;font-size:0.75rem;">' + (o.approvedBy || '-') + '</span>'}</td>
                    </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Tidak ada</td></tr>'}</tbody>
                </table>
            </div>
        </div>
    `;
}

async function approveLeave(id, status) {
    const res = await api('approveLeave', { id, status, approverName: currentUser.name });
    if (res.success) { showNotification(`Izin ${status === 'approved' ? 'disetujui' : 'ditolak'}`); await loadAllCache(); renderTabContent(); } 
    else showNotification(res.message, 'error');
}

async function approveOvertime(id, status) {
    const res = await api('approveOvertime', { id, status, approverName: currentUser.name });
    if (res.success) { showNotification(`Lembur ${status === 'approved' ? 'disetujui' : 'ditolak'}`); await loadAllCache(); renderTabContent(); } 
    else showNotification(res.message, 'error');
}

// ============================================================
// 6. KARYAWAN (Admin)
// ============================================================
function renderKaryawan(container) {
    container.innerHTML = `
        <div class="card">
            <h3>👥 Daftar Karyawan (${(cache.users || []).length})</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Nama</th><th>Email</th><th>Jabatan</th><th>Dept</th><th>Role</th><th>Gaji</th></tr></thead>
                    <tbody>${(cache.users || []).map(u => `<tr>
                        <td><strong>${u.name}</strong></td><td>${u.email}</td>
                        <td>${u.jabatan || '-'}</td><td>${u.department || '-'}</td>
                        <td><span class="badge ${u.role === 'admin' ? 'badge-info' : u.role === 'atasan' ? 'badge-warning' : 'badge-success'}">${u.role}</span></td>
                        <td>${formatRupiah(u.gaji)}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>
        <div class="card">
            <h3>➕ Tambah Karyawan</h3>
            <div class="grid-auto">
                <div class="form-group"><label>Nama</label><input id="nName"></div>
                <div class="form-group"><label>Email</label><input id="nEmail"></div>
                <div class="form-group"><label>Password</label><input id="nPass"></div>
                <div class="form-group"><label>Role</label>
                    <select id="nRole"><option value="karyawan">Karyawan</option><option value="atasan">Atasan</option><option value="admin">Admin</option></select>
                </div>
                <div class="form-group"><label>Jabatan</label><input id="nJabatan"></div>
                <div class="form-group"><label>Dept</label><input id="nDept"></div>
                <div class="form-group"><label>Gaji</label><input type="number" id="nGaji"></div>
                <div class="form-group"><label>Tunjangan</label><input type="number" id="nTunj"></div>
            </div>
            <button class="btn btn-primary" style="margin-top:12px;" onclick="addKaryawan()">➕ Tambah</button>
        </div>
    `;
}

async function addKaryawan() {
    const name = document.getElementById('nName').value.trim();
    const email = document.getElementById('nEmail').value.trim();
    const password = document.getElementById('nPass').value.trim();
    if (!name || !email || !password) return showNotification('Lengkapi!', 'error');
    const res = await api('createUser', {
        data: {
            name, email, password,
            role: document.getElementById('nRole').value,
            jabatan: document.getElementById('nJabatan').value,
            department: document.getElementById('nDept').value,
            gaji: Number(document.getElementById('nGaji').value) || 0,
            tunjangan: Number(document.getElementById('nTunj').value) || 0
        }
    });
    if (res.success) { showNotification('✅ Karyawan ditambahkan'); await loadAllCache(); renderTabContent(); } 
    else showNotification(res.message, 'error');
}

// ============================================================
// 7. MASTER DATA (Admin)
// ============================================================
function renderMaster(container) {
    container.innerHTML = `
        <div class="card">
            <h3>🏢 Departemen</h3>
            <div class="table-container"><table>
                <thead><tr><th>Nama</th><th>Kepala</th></tr></thead>
                <tbody>${(cache.departments || []).map(d => `<tr><td>${d.name}</td><td>${d.head}</td></tr>`).join('')}</tbody>
            </table></div>
            <div style="display:flex;gap:8px;margin-top:10px;">
                <input id="deptName" placeholder="Nama Dept" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <input id="deptHead" placeholder="Kepala" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <button class="btn btn-primary btn-sm" onclick="addDept()">➕</button>
            </div>
        </div>
        <div class="card">
            <h3>💼 Jabatan</h3>
            <div class="table-container"><table>
                <thead><tr><th>Nama</th><th>Level</th></tr></thead>
                <tbody>${(cache.jabatan || []).map(j => `<tr><td>${j.name}</td><td>${j.level}</td></tr>`).join('')}</tbody>
            </table></div>
            <div style="display:flex;gap:8px;margin-top:10px;">
                <input id="jabName" placeholder="Jabatan" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <select id="jabLevel" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                    <option>Manager</option><option>Supervisor</option><option>Staff</option>
                </select>
                <button class="btn btn-primary btn-sm" onclick="addJabatan()">➕</button>
            </div>
        </div>
        <div class="card">
            <h3>💰 Tunjangan</h3>
            <div class="table-container"><table>
                <thead><tr><th>Karyawan</th><th>Nama</th><th>Jumlah</th><th>Aksi</th></tr></thead>
                <tbody>${(cache.tunjangan || []).map(t => {
                    const u = (cache.users || []).find(x => String(x.id) === String(t.userId));
                    return `<tr><td>${u ? u.name : '-'}</td><td>${t.nama}</td><td>${formatRupiah(t.jumlah)}</td>
                        <td><button class="btn btn-danger btn-sm" onclick="delTunjangan(${t.id})">🗑️</button></td></tr>`;
                }).join('') || '<tr><td colspan="4" class="empty-state">-</td></tr>'}</tbody>
            </table></div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <select id="tunjUser" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;flex:1;">
                    ${(cache.users || []).map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
                </select>
                <input id="tunjNama" placeholder="Nama" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <input type="number" id="tunjJumlah" placeholder="Jumlah" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <button class="btn btn-primary btn-sm" onclick="addTunjangan()">➕</button>
            </div>
        </div>
    `;
}

async function addDept() {
    const name = document.getElementById('deptName').value.trim();
    if (!name) return;
    const res = await api('createDepartment', { data: { name, head: document.getElementById('deptHead').value || '-' } });
    if (res.success) { showNotification('✅'); await loadAllCache(); renderTabContent(); }
}
async function addJabatan() {
    const name = document.getElementById('jabName').value.trim();
    if (!name) return;
    const res = await api('createJabatan', { data: { name, level: document.getElementById('jabLevel').value } });
    if (res.success) { showNotification('✅'); await loadAllCache(); renderTabContent(); }
}
async function addTunjangan() {
    const userId = document.getElementById('tunjUser').value;
    const nama = document.getElementById('tunjNama').value.trim();
    const jumlah = Number(document.getElementById('tunjJumlah').value);
    if (!nama || !jumlah) return showNotification('Lengkapi!', 'error');
    const res = await api('createTunjangan', { data: { userId, nama, jumlah, periode: 'Bulanan' } });
    if (res.success) { showNotification('✅'); await loadAllCache(); renderTabContent(); }
}
async function delTunjangan(id) {
    const res = await api('deleteTunjangan', { id });
    if (res.success) { showNotification('Dihapus'); await loadAllCache(); renderTabContent(); }
}

// ============================================================
// 8. SK & SP (Admin)
// ============================================================
function renderDokumen(container) {
    container.innerHTML = `
        <div class="card">
            <h3>📄 Surat Keterangan (SK)</h3>
            <div class="table-container"><table>
                <thead><tr><th>Karyawan</th><th>Nomor</th><th>Tanggal</th><th>Keterangan</th></tr></thead>
                <tbody>${(cache.sk || []).map(s => `<tr><td>${s.userName}</td><td>${s.nomor}</td><td>${formatDate(s.tanggal)}</td><td>${s.keterangan}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">-</td></tr>'}</tbody>
            </table></div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <select id="skUser" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;flex:1;">
                    ${(cache.users || []).map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
                </select>
                <input id="skNomor" placeholder="Nomor SK" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <input type="date" id="skTgl" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <input id="skKet" placeholder="Keterangan" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;flex:2;">
                <button class="btn btn-primary btn-sm" onclick="addSK()">➕</button>
            </div>
        </div>
        <div class="card">
            <h3>⚠️ Surat Peringatan (SP)</h3>
            <div class="table-container"><table>
                <thead><tr><th>Karyawan</th><th>Level</th><th>Tanggal</th><th>Alasan</th></tr></thead>
                <tbody>${(cache.sp || []).map(s => `<tr><td>${s.userName}</td><td>${s.level}</td><td>${formatDate(s.tanggal)}</td><td>${s.alasan}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">-</td></tr>'}</tbody>
            </table></div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <select id="spUser" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;flex:1;">
                    ${(cache.users || []).map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
                </select>
                <select id="spLevel" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                    <option>SP1</option><option>SP2</option><option>SP3</option>
                </select>
                <input type="date" id="spTgl" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <input id="spAlasan" placeholder="Alasan" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;flex:2;">
                <button class="btn btn-danger btn-sm" onclick="addSP()">➕</button>
            </div>
        </div>
    `;
}
async function addSK() {
    const userId = document.getElementById('skUser').value;
    const user = (cache.users || []).find(u => String(u.id) === String(userId));
    const nomor = document.getElementById('skNomor').value.trim();
    if (!nomor) return showNotification('Nomor wajib!', 'error');
    const res = await api('createSK', { data: { userId, userName: user.name, nomor, tanggal: document.getElementById('skTgl').value || todayStr(), keterangan: document.getElementById('skKet').value, status: 'aktif' } });
    if (res.success) { showNotification('✅'); await loadAllCache(); renderTabContent(); }
}
async function addSP() {
    const userId = document.getElementById('spUser').value;
    const user = (cache.users || []).find(u => String(u.id) === String(userId));
    const res = await api('createSP', { data: { userId, userName: user.name, level: document.getElementById('spLevel').value, tanggal: document.getElementById('spTgl').value || todayStr(), alasan: document.getElementById('spAlasan').value, status: 'aktif' } });
    if (res.success) { showNotification('⚠️ SP ditambahkan'); await loadAllCache(); renderTabContent(); }
}

// ============================================================
// 9. PENGATURAN (Admin)
// ============================================================
function renderPengaturan(container) {
    const s = cache.settings || {};
    const hariList = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    let hariKerja = [];
    try { hariKerja = JSON.parse(s.hariKerja || '[]'); } catch (e) { hariKerja = String(s.hariKerja || '').split(','); }
    
    container.innerHTML = `
        <div class="card">
            <h3>⚙️ Pengaturan</h3>
            <div class="form-group"><label>Hari Kerja</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
                    ${hariList.map(h => `<label style="display:flex;align-items:center;gap:6px;background:#f8fafc;padding:8px 14px;border-radius:10px;border:1px solid #e2e8f0;cursor:pointer;font-size:0.85rem;">
                        <input type="checkbox" class="hariCb" value="${h}" ${hariKerja.includes(h) ? 'checked' : ''}> ${h}
                    </label>`).join('')}
                </div>
            </div>
            <div class="grid-auto">
                <div class="form-group"><label>Jam Masuk</label><input type="time" id="jamMasuk" value="${s.jamMasuk || '08:00'}"></div>
                <div class="form-group"><label>Jam Keluar</label><input type="time" id="jamKeluar" value="${s.jamKeluar || '17:00'}"></div>
                <div class="form-group"><label>Toleransi (menit)</label><input type="number" id="toleransi" value="${s.toleransi || 15}"></div>
                <div class="form-group"><label>Cuti Tahunan</label><input type="number" id="cutiTahunan" value="${s.cutiTahunan || 12}"></div>
                <div class="form-group"><label>Radius (m)</label><input type="number" id="radiusLokasi" value="${s.radiusLokasi || 100}"></div>
                <div class="form-group"><label>Kantor Lat</label><input id="kantorLat" value="${s.kantorLat || ''}"></div>
                <div class="form-group"><label>Kantor Lng</label><input id="kantorLng" value="${s.kantorLng || ''}"></div>
            </div>
            <button class="btn btn-primary" style="margin-top:12px;" onclick="savePengaturan()">💾 Simpan</button>
        </div>
        <div class="card">
            <h3>🎉 Cuti Bersama</h3>
            <div class="table-container"><table>
                <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Aksi</th></tr></thead>
                <tbody>${(cache.cutiBersama || []).map(c => `<tr>
                    <td>${formatDate(c.tanggal)}</td><td>${c.keterangan}</td>
                    <td><button class="btn btn-danger btn-sm" onclick="delCB(${c.id})">🗑️</button></td>
                </tr>`).join('') || '<tr><td colspan="3" class="empty-state">-</td></tr>'}</tbody>
            </table></div>
            <div style="display:flex;gap:8px;margin-top:10px;">
                <input type="date" id="cbTgl" style="padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <input id="cbKet" placeholder="Keterangan" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                <button class="btn btn-primary btn-sm" onclick="addCB()">➕</button>
            </div>
        </div>
    `;
}
async function savePengaturan() {
    const hariKerja = Array.from(document.querySelectorAll('.hariCb:checked')).map(c => c.value);
    const data = {
        hariKerja: JSON.stringify(hariKerja),
        jamMasuk: document.getElementById('jamMasuk').value,
        jamKeluar: document.getElementById('jamKeluar').value,
        toleransi: String(document.getElementById('toleransi').value),
        cutiTahunan: String(document.getElementById('cutiTahunan').value),
        radiusLokasi: String(document.getElementById('radiusLokasi').value),
        kantorLat: document.getElementById('kantorLat').value,
        kantorLng: document.getElementById('kantorLng').value
    };
    const res = await api('saveSettings', { data });
    if (res.success) { showNotification('✅ Pengaturan disimpan'); await loadAllCache(); renderTabContent(); }
}
async function addCB() {
    const tanggal = document.getElementById('cbTgl').value;
    const keterangan = document.getElementById('cbKet').value.trim();
    if (!tanggal || !keterangan) return showNotification('Lengkapi!', 'error');
    const res = await api('createCutiBersama', { data: { tanggal, keterangan } });
    if (res.success) { showNotification('✅'); await loadAllCache(); renderTabContent(); }
}
async function delCB(id) {
    const res = await api('deleteCutiBersama', { id });
    if (res.success) { showNotification('Dihapus'); await loadAllCache(); renderTabContent(); }
}

// ============================================================
// 10. REKAP (Admin)
// ============================================================
function renderRekap(container) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    container.innerHTML = `
        <div class="card">
            <h3>📈 Rekap Absensi</h3>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
                <div class="form-group" style="flex:1;min-width:140px;"><label>Dari</label><input type="date" id="rekapStart" value="${start}"></div>
                <div class="form-group" style="flex:1;min-width:140px;"><label>Sampai</label><input type="date" id="rekapEnd" value="${end}"></div>
                <button class="btn btn-primary" onclick="generateRekap()">📊 Tampilkan</button>
            </div>
        </div>
        <div id="rekapResult"></div>
    `;
    generateRekap();
}

async function generateRekap() {
    const startDate = document.getElementById('rekapStart').value;
    const endDate = document.getElementById('rekapEnd').value;
    if (!startDate || !endDate) return;
    const res = await api('getRekap', { startDate, endDate });
    if (!res.success) return showNotification(res.message, 'error');
    
    const { summary, rekapPerUser } = res.data;
    document.getElementById('rekapResult').innerHTML = `
        <div class="grid-auto" style="margin-bottom:16px;">
            <div class="stat-card" style="background:#eff6ff;"><div class="stat-value" style="color:#2563eb;">${summary.totalHariKerja}</div><div class="stat-label">Hari Kerja</div></div>
            <div class="stat-card" style="background:#f0fdf4;"><div class="stat-value" style="color:#16a34a;">${summary.totalHadir}</div><div class="stat-label">Hadir</div></div>
            <div class="stat-card" style="background:#fef3c7;"><div class="stat-value" style="color:#d97706;">${summary.totalCuti}</div><div class="stat-label">Cuti</div></div>
            <div class="stat-card" style="background:#fee2e2;"><div class="stat-value" style="color:#dc2626;">${summary.totalAlpha}</div><div class="stat-label">Alpha</div></div>
            <div class="stat-card" style="background:#fce7f3;"><div class="stat-value" style="color:#db2777;">${summary.totalLate}</div><div class="stat-label">Total Telat (menit)</div></div>
        </div>
        <div class="card">
            <h3>📋 Per Karyawan</h3>
            <div class="table-container"><table>
                <thead><tr><th>Karyawan</th><th>Jabatan</th><th>Hadir</th><th>Cuti</th><th>Alpha</th><th>Telat</th><th>%</th></tr></thead>
                <tbody>${(rekapPerUser || []).map(r => `<tr>
                    <td><strong>${r.userName}</strong></td><td>${r.jabatan || '-'}</td>
                    <td>${r.hadir}</td><td>${r.cuti}</td>
                    <td style="color:#dc2626;font-weight:600;">${r.alpha}</td>
                    <td>${r.totalLate}m</td>
                    <td><strong>${r.persen}%</strong></td>
                </tr>`).join('')}</tbody>
            </table></div>
        </div>
    `;
}

// ============================================================
// EVENT LISTENERS & START
// ============================================================
document.getElementById('loginBtn').onclick = doLogin;
document.getElementById('loginPassword').addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('logoutBtn').onclick = logout;
window.addEventListener('beforeunload', stopCamera);

checkSession();
