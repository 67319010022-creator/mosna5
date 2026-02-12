const firebaseConfig = {
    apiKey: "AIzaSyCQb43c4FNQpHZGzRI6O3S3E_xtIE2nlb4",
    authDomain: "giant-dutch-goldfish-farm.firebaseapp.com",
    databaseURL: "https://giant-dutch-goldfish-farm-default-rtdb.firebaseio.com",
    projectId: "giant-dutch-goldfish-farm",
    storageBucket: "giant-dutch-goldfish-farm.firebasestorage.app",
    messagingSenderId: "22451559921",
    appId: "1:22451559921:web:97340007e0e9b023253850"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let tempHistory = [];
let humidHistory = [];
let timeLabels = [];

setInterval(() => {
    document.getElementById('realtime-clock').innerText = new Date().toLocaleString('th-TH');
}, 1000);


var tempGauge = new LinearGauge({
    renderTo: 'tempGauge', width: 160, height: 350, units: "°C",
    minValue: 0, maxValue: 50, majorTicks: ["0", "10", "20", "30", "40", "50"],
    colorPlate: "rgba(255,255,255,0.1)", colorNumbers: "#fff",
    borderShadowWidth: 0, borders: true, borderRadius: 10,
    needleType: "arrow", needleWidth: 4, animationDuration: 1500,
    highlights: [{ from: 32, to: 50, color: "rgba(255, 0, 0, .3)" }],
    barWidth: 15, value: 0,
    tickSide: "left", numberSide: "left", needleSide: "left"
}).draw();


var humidGauge = echarts.init(document.getElementById('humidGaugeECharts'));
var humidOption = {
    series: [{
        type: 'gauge', min: 0, max: 100, splitNumber: 5, radius: '95%',
        progress: { show: true, width: 12, itemStyle: { color: '#0dcaf0' } },
        axisLine: { lineStyle: { width: 12 } },
        axisLabel: { distance: 15, color: '#fff', fontSize: 12 },
        splitLine: { show: true, distance: 0, length: 12, lineStyle: { color: '#fff', width: 2 } },
        pointer: { itemStyle: { color: '#0dcaf0' } },
        detail: { valueAnimation: true, formatter: '{value}%', fontSize: 28, color: '#0dcaf0', offsetCenter: [0, '75%'] },
        data: [{ value: 0 }]
    }]
};
humidGauge.setOption(humidOption);

// กราฟอุณหภูมิ (Apex)
var tempChart = new ApexCharts(document.querySelector("#tempChart"), {
    series: [{ name: 'Temp', data: [] }],
    chart: { type: 'area', height: 280, toolbar: { show: false }, foreColor: '#fff', animations: { enabled: true } },
    stroke: { curve: 'smooth', width: 3 },
    colors: ['#ffc107'],
    xaxis: { categories: [], labels: { show: true } },
    tooltip: { theme: 'dark' }
});
tempChart.render();

// กราฟความชื้น (ECharts Line)
var hChart = echarts.init(document.getElementById('humidChart'));
var hChartOption = {
    grid: { bottom: 30, right: 20, left: 40, top: 20 },
    xAxis: { type: 'category', data: [], axisLabel: { color: '#fff' } },
    yAxis: { type: 'value', axisLabel: { color: '#fff' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } } },
    series: [{ data: [], type: 'line', smooth: true, color: '#0dcaf0', symbolSize: 8, lineStyle: { width: 3 } }]
};
hChart.setOption(hChartOption);

// --- เชื่อมต่อ Firebase ---
db.ref('sensor/temp').on('value', snap => {
    const val = snap.val();
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    tempGauge.value = val;
    document.getElementById('tempText').innerText = val + " °C";

    // ผลักข้อมูลเข้ากราฟ
    tempHistory.push(val);
    timeLabels.push(time);
    if (tempHistory.length > 15) { tempHistory.shift(); timeLabels.shift(); }

    tempChart.updateSeries([{ data: tempHistory }]);
    tempChart.updateOptions({ xaxis: { categories: timeLabels } });
});

db.ref('sensor/humid').on('value', snap => {
    const val = snap.val();
    humidGauge.setOption({ series: [{ data: [{ value: val }] }] });
    document.getElementById('humidText').innerText = val + " %";

    humidHistory.push(val);
    if (humidHistory.length > 15) { humidHistory.shift(); }

    hChart.setOption({
        xAxis: { data: timeLabels },
        series: [{ data: humidHistory }]
    });
});

// สวิตช์
const sw = document.getElementById('led-switch');
db.ref('switch/status').on('value', snap => {
    const status = snap.val();
    sw.checked = (status === 1);
    document.getElementById('statusText').innerText = status === 1 ? "ON (ทำงาน)" : "OFF (หยุด)";
    document.getElementById('statusText').style.color = status === 1 ? "#2ecc71" : "#e74c3c";
});
sw.addEventListener('change', (e) => { db.ref('switch/status').set(e.target.checked ? 1 : 0); });

window.addEventListener('resize', () => { humidGauge.resize(); hChart.resize(); });

function updateCondition() {
    const t = document.getElementById('inputTemp').value;
    const h = document.getElementById('inputHumid').value;

    if (t === "" || h === "") {
        alert("กรุณากรอกข้อมูลให้ครบถ้วนก่อนบันทึก");
        return;
    }

    // อัปเดตไปที่โฟลเดอร์ condition
    db.ref('condition').update({
        temp: parseFloat(t),
        humid: parseFloat(h)
    }).then(() => {
        alert("บันทึกเงื่อนไขใหม่เรียบร้อยแล้ว!");
    }).catch((error) => {
        alert("เกิดข้อผิดพลาด: " + error.message);
    });
}


firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        window.location.replace("login.html");
    }
});

function logout() {
    if (confirm("คุณต้องการออกจากระบบใช่หรือไม่?")) {
        firebase.auth().signOut().then(() => {
            console.log("Logout successful");

        }).catch((error) => {
            alert("เกิดข้อผิดพลาด: " + error.message);
        });
    }
}

