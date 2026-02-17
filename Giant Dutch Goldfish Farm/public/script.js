const firebaseConfig = {
    apiKey: "AIzaSyCQb43c4FNQpHZGzRI6O3S3E_xtIE2nlb4",
    authDomain: "giant-dutch-goldfish-farm.firebaseapp.com",
    databaseURL: "https://giant-dutch-goldfish-farm-default-rtdb.firebaseio.com",
    projectId: "giant-dutch-goldfish-farm",
    storageBucket: "giant-dutch-goldfish-farm.firebasestorage.app",
    messagingSenderId: "22451559921",
    appId: "1:22451559921:web:97340007e0e9b023253850"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// นาฬิกา Real-time
if (document.getElementById('realtime-clock')) {
    setInterval(() => {
        document.getElementById('realtime-clock').innerText = new Date().toLocaleString('th-TH');
    }, 1000);
}

// ==========================================
// 2. ส่วนของหน้า Dashboard (index.html)
// ==========================================
if (document.getElementById('tempGauge')) {
    var tempGauge = new LinearGauge({
        renderTo: 'tempGauge', width: 160, height: 350, units: "°C",
        minValue: 0, maxValue: 50, majorTicks: ["0", "10", "20", "30", "40", "50"],
        colorPlate: "rgba(255,255,255,0.1)", colorNumbers: "#fff",
        borderShadowWidth: 0, borders: true, borderRadius: 10,
        needleType: "arrow", needleWidth: 4, animationDuration: 1500,
        highlights: [{ from: 32, to: 50, color: "rgba(255, 0, 0, .3)" }],
        barWidth: 15, value: 0
    }).draw();

    var humidGauge = echarts.init(document.getElementById('humidGaugeECharts'));
    humidGauge.setOption({
        series: [{
            type: 'gauge', min: 0, max: 100, radius: '90%',
            progress: { show: true, width: 10, itemStyle: { color: '#0dcaf0' } },
            axisLine: { lineStyle: { width: 10 } },
            axisLabel: { color: '#fff', fontSize: 10 },
            detail: { valueAnimation: true, formatter: '{value}%', color: '#0dcaf0', fontSize: 20, offsetCenter: [0, '70%'] },
            data: [{ value: 0 }]
        }]
    });

    var tChart = new ApexCharts(document.querySelector("#tempChart"), {
        chart: { type: 'area', height: 300, foreColor: '#fff', toolbar: { show: false } },
        series: [{ name: 'อุณหภูมิ', data: [] }],
        stroke: { curve: 'smooth' }, colors: ['#ffc107'], xaxis: { categories: [] }
    });
    tChart.render();

    var hChart = new ApexCharts(document.querySelector("#humidChart"), {
        chart: { type: 'area', height: 300, foreColor: '#fff', toolbar: { show: false } },
        series: [{ name: 'ความชื้น', data: [] }],
        stroke: { curve: 'smooth' }, colors: ['#0dcaf0'], xaxis: { categories: [] }
    });
    hChart.render();

    db.ref('sensor/temp').on('value', snap => {
        tempGauge.value = snap.val();
        if (document.getElementById('tempText')) document.getElementById('tempText').innerText = snap.val() + " °C";
    });

    db.ref('sensor/humid').on('value', snap => {
        humidGauge.setOption({ series: [{ data: [{ value: snap.val() }] }] });
        if (document.getElementById('humidText')) document.getElementById('humidText').innerText = snap.val() + " %";
    });

    db.ref('logs').limitToLast(10).on('value', snap => {
        const data = snap.val();
        if (data) {
            let temps = [], humids = [], times = [];
            Object.values(data).forEach(item => {
                let dTime = item.time || new Date().toLocaleTimeString('th-TH');
                temps.push(item.temp); humids.push(item.humid); times.push(dTime);
            });
            tChart.updateSeries([{ data: temps }]);
            hChart.updateSeries([{ data: humids }]);
            tChart.updateOptions({ xaxis: { categories: times } });
            hChart.updateOptions({ xaxis: { categories: times } });
        }
    });
}

// ==========================================
// 3. ส่วนของหน้า History (history.html)
// ==========================================
if (document.getElementById('fullHistoryChart')) {
    var fullChart = new ApexCharts(document.querySelector("#fullHistoryChart"), {
        chart: { type: 'area', height: 450, foreColor: '#fff', toolbar: { show: true } },
        series: [{ name: 'อุณหภูมิ', data: [] }, { name: 'ความชื้น', data: [] }],
        xaxis: { categories: [] },
        colors: ['#ffc107', '#0dcaf0'],
        stroke: { curve: 'smooth' },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.5, opacityTo: 0.1 } }
    });
    fullChart.render();

    db.ref('logs').limitToLast(30).on('value', snap => {
        const data = snap.val();
        if (data) {
            let temps = [], humids = [], labels = [];
            Object.keys(data).forEach(key => {
                const item = data[key];
                let dTime = item.time || new Date().toLocaleTimeString('th-TH');
                temps.push(item.temp);
                humids.push(item.humid);
                labels.push(dTime);
            });
            fullChart.updateSeries([{ data: temps }, { data: humids }]);
            fullChart.updateOptions({ xaxis: { categories: labels } });
        }
    });
}

// ==========================================
// 4. ส่วนจัดการหน้า Config (ดึงค่าปัจจุบันมาโชว์ + บันทึกแยกปุ่ม)
// ==========================================
if (document.getElementById('inputTemp') || document.getElementById('inputHumid')) {
    // ดึงค่าที่ตั้งไว้จาก Database มาโชว์ในช่องกรอก (Real-time Feedback)
    db.ref('condition/temp').on('value', snap => {
        const val = snap.val();
        if (val !== null) {
            if(document.getElementById('inputTemp')) document.getElementById('inputTemp').value = val;
            if(document.getElementById('currentTemp')) document.getElementById('currentTemp').innerText = val;
        }
    });

    db.ref('condition/humid').on('value', snap => {
        const val = snap.val();
        if (val !== null) {
            if(document.getElementById('inputHumid')) document.getElementById('inputHumid').value = val;
            if(document.getElementById('currentHumid')) document.getElementById('currentHumid').innerText = val;
        }
    });
}

// ฟังก์ชันบันทึกแยก : อุณหภูมิ
function updateTemp() {
    const t = document.getElementById('inputTemp').value;
    if (t !== "") {
        db.ref('condition/temp').set(parseFloat(t)).then(() => alert("บันทึกค่าอุณหภูมิสำเร็จ!"));
    } else { alert("กรุณากรอกตัวเลขอุณหภูมิ"); }
}

// ฟังก์ชันบันทึกแยก : ความชื้น
function updateHumid() {
    const h = document.getElementById('inputHumid').value;
    if (h !== "") {
        db.ref('condition/humid').set(parseFloat(h)).then(() => alert("บันทึกค่าความชื้นสำเร็จ!"));
    } else { alert("กรุณากรอกตัวเลขความชื้น"); }
}

// ==========================================
// 5. ส่วนอื่นๆ (Logs, Users, Switch, Auth)
// ==========================================
if (document.getElementById('fullLogTableBody')) {
    db.ref('logs').limitToLast(50).on('value', snap => {
        const tableBody = document.getElementById('fullLogTableBody');
        tableBody.innerHTML = "";
        const data = snap.val();
        if (data) {
            let count = 1;
            Object.keys(data).reverse().forEach(key => {
                const item = data[key];
                let dTime = item.time || new Date().toLocaleTimeString('th-TH');
                tableBody.insertAdjacentHTML('beforeend', `<tr><td>${count++}</td><td>${dTime}</td><td class="text-warning fw-bold">${item.temp} °C</td><td class="text-info fw-bold">${item.humid} %</td></tr>`);
            });
        }
    });
}

if (document.getElementById('userTableAdmin')) {
    db.ref('users').on('value', snap => {
        const tableBody = document.getElementById('userTableAdmin');
        tableBody.innerHTML = "";
        const data = snap.val();
        if (data) {
            Object.keys(data).forEach(key => {
                const user = data[key];
                tableBody.insertAdjacentHTML('beforeend', `<tr><td style="font-size:0.8rem">${key}</td><td>${user.email}</td><td><span class="badge ${user.role === 'admin' ? 'bg-warning' : 'bg-success'}">${user.role || 'user'}</span></td><td class="text-center"><button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${key}')">ลบ</button></td></tr>`);
            });
        }
    });
}

function deleteUser(uid) { if (confirm("ยืนยันการลบผู้ใช้งานนี้?")) { db.ref('users/' + uid).remove(); } }

const ledSw = document.getElementById('led-switch');
if (ledSw) {
    db.ref('switch/status').on('value', snap => {
        ledSw.checked = (snap.val() === 1);
        const txt = document.getElementById('statusText');
        if (txt) {
            txt.innerText = snap.val() === 1 ? "ON" : "OFF";
            txt.className = snap.val() === 1 ? "mt-4 fw-bold fs-5 text-success" : "mt-4 fw-bold fs-5 text-danger";
        }
    });
    ledSw.addEventListener('change', (e) => { db.ref('switch/status').set(e.target.checked ? 1 : 0); });
}

// ระบบ Auth
let selectedRole = 'user';
function setRole(role) {
    selectedRole = role;
    if(document.getElementById('btn-user-role')) document.getElementById('btn-user-role').classList.toggle('active', role === 'user');
    if(document.getElementById('btn-admin-role')) document.getElementById('btn-admin-role').classList.toggle('active', role === 'admin');
    const regBtn = document.getElementById('btn-reg-ui');
    if(regBtn) regBtn.style.display = (role === 'admin') ? 'none' : 'block';
}

function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('msg');
    if (!email || !password) { if(msg) msg.innerText = "กรุณากรอกข้อมูลให้ครบถ้วน"; return; }
    firebase.auth().signInWithEmailAndPassword(email, password).then((userCredential) => {
        const user = userCredential.user;
        db.ref('users/' + user.uid).once('value').then((snapshot) => {
            const userData = snapshot.val();
            if (selectedRole === 'admin') {
                if (userData && userData.role === 'admin') { window.location.href = "admin_users.html"; }
                else { if(msg) msg.innerText = "คุณไม่มีสิทธิ์เข้าถึงในฐานะแอดมิน"; firebase.auth().signOut(); }
            } else { window.location.href = "index.html"; }
        });
    }).catch(err => { if(msg) msg.innerText = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; });
}

function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        Swal.fire({
            icon: 'warning',
            title: 'ข้อมูลไม่ครบ',
            text: 'กรุณากรอกอีเมลและรหัสผ่าน',
            confirmButtonColor: '#ffc107'
        });
        return;
    }

    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((res) => {
            db.ref('users/' + res.user.uid).set({
                email: email,
                role: 'user'
            }).then(() => {
                // แสดงเครื่องหมายติ๊กถูกสำเร็จ
                Swal.fire({
                    icon: 'success',
                    title: 'สมัครสมาชิกสำเร็จ!',
                    text: 'ยินดีต้อนรับเข้าสู่ฟาร์มปลาทอง',
                    showConfirmButton: false,
                    timer: 2000, // ปิดเองภายใน 2 วินาที
                    iconColor: '#4db6ac'
                }).then(() => {
                    location.reload();
                });
            });
        })
        .catch(err => {
            // แจ้งเตือนเมื่อเกิด Error เช่น อีเมลซ้ำ หรือ รหัสผ่านสั้นไป
            Swal.fire({
                icon: 'error',
                title: 'สมัครไม่สำเร็จ',
                text: 'เกิดข้อผิดพลาด: ' + err.message,
                confirmButtonColor: '#ff6b6b'
            });
        });
}

function logout() { firebase.auth().signOut().then(() => { window.location.href = "login.html"; }); }