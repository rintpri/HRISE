// STATE
let currentUser = null;
let currentToken = null;
let currentTab = 'dashboard';
let mediaStream = null;
let currentLocation = null;
let currentPhotoData = null;
let clockInterval = null;

let cache = { users: [], attendance: [], leaves: [], overtime: [], settings: {}, departments: [], jabatan: [], tunjangan: [], sk: [], sp: [], cutiBersama: [] };

// API CALL
async function api(action, params = {}) {
    try {
        const body = { action, token: currentToken || CONFIG.API_TOKEN, ...params };
        const res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
        const json = await res.json();
        if (!json.success && json.message === 'Unauthorized') logout();
        return json;
    } catch (err) { return { success: false, message: 'Koneksi error: ' + err.message }; }
}

function showNotification(msg, type = 'success') {
    const n = document.createElement('div'); n.className = 'notification ' + type; n.textContent = msg;
    document.body.appendChild(n); setTimeout(() => n.remove(), 3000);
}
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'; }
function formatTime(d) { return d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'; }
function formatRupiah(n) { return 'Rp ' + (n || 0).toLocaleString('id-ID'); }
function todayStr() { return new Date().toISOString().split('T')[0]; }

// AUTH
async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const role = document.getElementById('loginRole').value;
    const btn = document.getElementById('loginBtn'); btn.disabled = true; btn.textContent = '⏳...';
    const res = await api('login', { email, password, role });
    btn.disabled = false; btn.textContent = 'Masuk';
    if (res.success) {
        currentUser = res.data.user; currentToken = res.data.token;
        localStorage.setItem('hris_user', JSON.stringify(currentUser)); localStorage.setItem('hris_token', currentToken);
        await loadAllCache(); renderApp();
    } else showNotification(res.message, 'error');
}
function logout() {
    currentUser = null; currentToken = null; clearInterval(clockInterval);
    localStorage.removeItem('hris_user'); localStorage.removeItem('hris_token'); stopCamera(); renderApp();
}
async function checkSession() {
    const sU = localStorage.getItem('hris_user'), sT = localStorage.getItem('hris_token');
    if (sU && sT) { currentUser = JSON.parse(sU); currentToken = sT; await loadAllCache(); renderApp(); }
    else { document.getElementById('loadingScreen').classList.add('hidden'); document.getElementById('loginScreen').classList.remove('hidden'); testConnection(); }
}
async function loadAllCache() {
    const [u, a, l, o, s, d, j, t, sk, sp, cb] = await Promise.all([
        api('getUsers'), api('getAttendance'), api('getLeaves'), api('getOvertime'), api('getSettings'),
        api('getDepartments'), api('getJabatan'), api('getTunjangan'), api('getSK'), api('getSP'), api('getCutiBersama')
    ]);
    if(u.success) cache.users=u.data; if(a.success) cache.attendance=a.data; if(l.success) cache.leaves=l.data;
    if(o.success) cache.overtime=o.data; if(s.success) cache.settings=s.data; if(d.success) cache.departments=d.data;
    if(j.success) cache.jabatan=j.data; if(t.success) cache.tunjangan=t.data; if(sk.success) cache.sk=sk.data;
    if(sp.success) cache.sp=sp.data; if(cb.success) cache.cutiBersama=cb.data;
}
async function testConnection() {
    const el = document.getElementById('apiStatus'); if (!el) return;
    el.textContent = '⏳ Menguji API...'; const res = await api('ping');
    el.textContent = res.success ? '✅ API Terhubung' : '❌ Gagal: ' + res.message;
    el.className = 'api-status ' + (res.success ? 'ok' : 'error');
}

// RENDER
function renderApp() {
    document.getElementById('loadingScreen').classList.add('hidden');
    const l = document.getElementById('loginScreen'), d = document.getElementById('dashboardScreen'), ui = document.getElementById('userInfo');
    if (currentUser) {
        l.classList.add('hidden'); d.classList.remove('hidden'); ui.classList.remove('hidden');
        document.getElementById('userNameDisplay').textContent = currentUser.name;
        document.getElementById('userRoleDisplay').textContent = currentUser.role.toUpperCase();
        renderTabs(); renderTabContent();
    } else { l.classList.remove('hidden'); d.classList.add('hidden'); ui.classList.add('hidden'); }
}
function getTabsForRole() {
    const t = [{ id: 'dashboard', label: '📊 Dashboard' }, { id: 'absensi', label: '📍 Absensi' }, { id: 'izin', label: '📝 Izin/Cuti' }, { id: 'profil', label: '👤 Profil' }];
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
    const map = { dashboard: renderDashboard, absensi: renderAbsensi, izin: renderIzin, profil: renderProfil, approval: renderApproval, karyawan: renderKaryawan, master: renderMaster, dokumen: renderDokumen, pengaturan: renderPengaturan, rekap: renderRekap };
    (map[currentTab] || renderDashboard)(c);
}

// 1. DASHBOARD BARU (Jam Berjalan & Info Cuti)
function renderDashboard(container) {
    const today = todayStr();
    const todayAtt = cache.attendance.filter(a => a.date === today);
    const myAtt = todayAtt.find(a => String(a.userId) === String(currentUser.id));
    
    // Hitung sisa cuti
    const settings = cache.settings;
    const kuota = Number(settings.cutiTahunan || 12);
    const cutiBersamaCount = cache.cutiBersama.length;
    const approvedLeaves = cache.leaves.filter(l => String(l.userId) === String(currentUser.id) && l.status === 'approved' && l.type !== 'Cuti Bersama');
    let totalCutiPribadi = 0;
    approvedLeaves.forEach(l => {
        const start = new Date(l.startDate), end = new Date(l.endDate);
        totalCutiPribadi += Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    });
    const sisaCuti = Math.max(0, kuota - cutiBersamaCount - totalCutiPribadi);

    container.innerHTML = `
        <div class="card" style="text-align:center; background:linear-gradient(135deg, #2563eb, #1e40af); color:white;">
            <h2 id="liveClock" style="font-size: 2.5rem; margin-bottom: 8px;">00:00:00</h2>
            <p id="liveDate" style="font-size: 1.1rem; opacity: 0.9;"></p>
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
                    <div style="margin-top:16px; padding:12px; background:#fffbeb; border-radius:12px; border:1px solid #fde68a; font-size:0.85rem;">
                        <strong>ℹ️ Info:</strong> Batas kerja normal adalah <strong>9 jam</strong>. Jika pulang lebih dari 9 jam, otomatis dihitung lembur. Pastikan mengajukan Lembur & Approval Atasan jika bekerja di hari libur.
                    </div>
                    <button class="btn btn-primary btn-full" style="margin-top:12px;" onclick="currentTab='absensi';renderTabs();renderTabContent();">📍 Ke Halaman Absensi</button>
                </div>
            </div>
            <div>
                <div class="card" style="text-align:center;">
                    <h3>🏖️ Sisa Cuti Anda</h3>
                    <div style="font-size: 3rem; font-weight: 900; color: #2563eb; margin: 10px 0;">${sisaCuti}</div>
                    <div style="color: #64748b; font-size: 0.85rem;">Hari Tersisa</div>
                    <div style="margin-top: 16px; font-size: 0.8rem; color: #94a3b8; text-align: left;">
                        Kuota Tahunan: ${kuota} hari<br>
                        Cuti Bersama: -${cutiBersamaCount} hari<br>
                        Cuti Disetujui: -${totalCutiPribadi} hari
                    </div>
                </div>
            </div>
        </div>
    `;

    // Jam berjalan
    clockInterval = setInterval(() => {
        const now = new Date();
        const clock = document.getElementById('liveClock');
        const dt = document.getElementById('liveDate');
        if (clock) clock.textContent = now.toLocaleTimeString('id-ID');
        if (dt) dt.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }, 1000);
}

// 2. ABSENSI (Validasi 1x & 9 Jam)
function renderAbsensi(container) {
    const today = todayStr();
    const rec = cache.attendance.find(a => String(a.userId) === String(currentUser.id) && a.date === today);
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
                            ${cache.overtime.filter(o => String(o.userId) === String(currentUser.id)).map(o => `
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

async function handleCheck(type) {
    if (type === 'in' && !currentPhotoData) return showNotification('Ambil foto dulu!', 'error');
    const btn = document.getElementById(type === 'in' ? 'checkInBtn' : 'checkOutBtn');
    btn.disabled = true; btn.textContent = '⏳ Memproses...';
    const res = await api(type === 'in' ? 'checkIn' : 'checkOut', {
        userId: currentUser.id, userName: currentUser.name,
        locationLat: currentLocation?.lat, locationLng: currentLocation?.lng, photo: currentPhotoData
    });
    if (res.success) { showNotification(`✅ ${type === 'in' ? 'Check In' : 'Check Out'} berhasil!`); currentPhotoData = null; await loadAllCache(); renderTabContent(); }
    else { showNotification(res.message, 'error'); btn.disabled = false; btn.textContent = type === 'in' ? '🟢 Check In' : '🔴 Check Out'; }
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
    if (res.success) { showNotification('✅ Lembur diajukan, menunggu approval'); await loadAllCache(); renderTabContent(); }
    else showNotification(res.message, 'error');
}

// FUNGSI LAINNYA (detectLocation, startCamera, capturePhoto, renderIzin, renderProfil, dll) TETAP SAMA SEPERTI SEBELUMNYA
function detectLocation() {
    const t = document.getElementById('locationText'); if (!t) return;
    navigator.geolocation.getCurrentPosition(p => { currentLocation = { lat: p.coords.latitude, lng: p.coords.longitude }; t.textContent = `✅ ${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`; }, e => { t.textContent = '⚠️ ' + e.message; }, { enableHighAccuracy: true });
}
function startCamera() { navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(s => { mediaStream = s; document.getElementById('video').srcObject = s; document.getElementById('captureBtn').disabled = false; }).catch(e => showNotification('Kamera error', 'error')); }
function stopCamera() { if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; } }
function capturePhoto() { const v = document.getElementById('video'), c = document.getElementById('canvas'); c.width = v.videoWidth || 320; c.height = v.videoHeight || 240; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); currentPhotoData = c.toDataURL('image/jpeg', 0.7); document.getElementById('photoPreview').innerHTML = `<img src="${currentPhotoData}">`; stopCamera(); showNotification('Foto diambil!'); }

function renderProfil(container) {
    const s = cache.settings;
    const kuota = Number(s.cutiTahunan || 12);
    const cutiBersamaCount = cache.cutiBersama.length;
    const approvedLeaves = cache.leaves.filter(l => String(l.userId) === String(currentUser.id) && l.status === 'approved');
    let totalCutiPribadi = 0;
    approvedLeaves.forEach(l => { totalCutiPribadi += Math.ceil((new Date(l.endDate) - new Date(l.startDate)) / (1000*60*60*24)) + 1; });
    const sisaCuti = Math.max(0, kuota - cutiBersamaCount - totalCutiPribadi);

    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="card">
                <h3>👤 ${currentUser.name}</h3>
                <div class="info-row"><span class="info-label">Email</span><span class="info-value">${currentUser.email}</span></div>
                <div class="info-row"><span class="info-label">Jabatan</span><span class="info-value">${currentUser.jabatan || '-'}</span></div>
                <div class="info-row"><span class="info-label">Departemen</span><span class="info-value">${currentUser.department || '-'}</span></div>
                <div class="info-row" style="background:#eff6ff; padding:12px; border-radius:8px; margin-top:12px;">
                    <span class="info-label" style="font-weight:bold;">Sisa Cuti (Tahun Ini)</span>
                    <span class="info-value" style="font-size:1.3rem; color:#2563eb;">${sisaCuti} Hari</span>
                </div>
                <p style="font-size:0.75rem; color:#64748b; margin-top:8px;">Kuota: ${kuota} | Cuti Bersama: -${cutiBersamaCount} | Cuti Pribadi: -${totalCutiPribadi}</p>
            </div>
            <div class="card">
                <h3>📊 Statistik Kehadiran</h3>
                <p>Total Absensi: ${cache.attendance.filter(a => String(a.userId) === String(currentUser.id)).length}x</p>
            </div>
        </div>
    `;
}

// (Sertakan fungsi renderIzin, renderApproval (tambahkan approval lembur), renderKaryawan, renderMaster, renderDokumen, renderPengaturan, renderRekap dari kode sebelumnya)
document.getElementById('loginBtn').onclick = doLogin;
document.getElementById('logoutBtn').onclick = logout;
checkSession();
