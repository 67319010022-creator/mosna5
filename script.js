// ==========================================
// 1. การตั้งค่า Firebase & ส่วนกลาง
// ==========================================
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
    // --- Gauges Setup ---
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

    // --- Charts Setup ---
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

    // Real-time Update
    db.ref('sensor/temp').on('value', snap => {
        tempGauge.value = snap.val();
        if(document.getElementById('tempText')) document.getElementById('tempText').innerText = snap.val() + " °C";
    });

    db.ref('sensor/humid').on('value', snap => {
        humidGauge.setOption({ series: [{ data: [{ value: snap.val() }] }] });
        if(document.getElementById('humidText')) document.getElementById('humidText').innerText = snap.val() + " %";
    });

    // 10 Records for Index Charts
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
            tChart.updateOptions({ xaxis: { categories: times }});
            hChart.updateOptions({ xaxis: { categories: times }});
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
            fullHistoryChart.updateOptions({ xaxis: { categories: labels } }); // ใช้ labels ที่มีเวลา
        }
    });
}

// ==========================================
// 4. ส่วนของหน้า Logs Table (logs.html)
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
                tableBody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td>${count++}</td>
                        <td>${dTime}</td>
                        <td class="text-warning fw-bold">${item.temp} °C</td>
                        <td class="text-info fw-bold">${item.humid} %</td>
                    </tr>`);
            });
        }
    });
}

// ==========================================
// 5. ปุ่มกดและฟังก์ชันอื่นๆ
// ==========================================
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

function updateCondition() {
    const t = document.getElementById('inputTemp').value;
    const h = document.getElementById('inputHumid').value;
    if (t && h) {
        db.ref('condition').update({ temp: parseFloat(t), humid: parseFloat(h) }).then(() => alert("บันทึกค่าแล้ว!"));
    }
}

function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => { window.location.href = "index.html"; })
        .catch(err => { if(document.getElementById('msg')) document.getElementById('msg').innerText = err.message; });
}

function logout() { firebase.auth().signOut().then(() => { window.location.href = "login.html"; }); }