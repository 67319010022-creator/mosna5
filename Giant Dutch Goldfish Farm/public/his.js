const firebaseConfig = {
        apiKey: "AIzaSyCQb43c4FNQpHZGzRI6O3S3E_xtIE2nlb4",
        authDomain: "giant-dutch-goldfish-farm.firebaseapp.com",
        databaseURL: "https://giant-dutch-goldfish-farm-default-rtdb.firebaseio.com",
        projectId: "giant-dutch-goldfish-farm",
        storageBucket: "giant-dutch-goldfish-farm.firebasestorage.app",
        messagingSenderId: "22451559921",
        appId: "1:22451559921:web:97340007e0e9b023253850",
        measurementId: "G-LTR0D02PD7"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    let hTemp = [];
    let hHumid = [];
    let hTime = [];

    
    var options = {
        chart: { 
            type: 'area', 
            height: 350, 
            foreColor: '#fff', 
            toolbar: { show: false },
            animations: { enabled: true }
        },
        series: [{ name: 'อุณหภูมิ', data: [] }, { name: 'ความชื้น', data: [] }],
        xaxis: { categories: [], labels: { style: { colors: '#fff' } } },
        stroke: { curve: 'smooth', width: 3 },
        colors: ['#ffc107', '#0dcaf0'],
        fill: { 
            type: 'gradient', 
            gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.1 } 
        },
        grid: { borderColor: 'rgba(255,255,255,0.1)' },
        tooltip: { theme: 'dark' }
    };

    // สร้างกราฟลงใน div id="historyChart"
    var chart = new ApexCharts(document.querySelector("#historyChart"), options);
    chart.render();
    // ------------------------------------

    // ดึงข้อมูลจาก logs
    db.ref('logs').limitToLast(20).on('value', snap => {
        const dataObj = snap.val();
        const table = document.getElementById('statTableBody');
        table.innerHTML = ""; 

      
        hTemp = []; 
        hHumid = []; 
        hTime = [];

        if (dataObj) {
            let count = 1;

            Object.keys(dataObj).forEach(key => {
                const item = dataObj[key];
                const time = new Date().toLocaleTimeString('th-TH');

                const row = `<tr>
                    <td>${count++}</td> 
                    <td>${time}</td>
                    <td class="text-warning">${item.temp} °C</td>
                    <td class="text-info">${item.humid} %</td>
                </tr>`;
                table.insertAdjacentHTML('beforeend', row);

                hTemp.push(item.temp);
                hHumid.push(item.humid);
                hTime.push(time);
            });

            // อัปเดตกราฟด้วยข้อมูลใหม่
            chart.updateSeries([
                { name: 'อุณหภูมิ', data: hTemp },
                { name: 'ความชื้น', data: hHumid }
            ]);
            chart.updateOptions({ xaxis: { categories: hTime } });
        }
    });