
const CONFIG = {
    PI_IP: "192.168.21.11",  
    PI_PORT: "5000",         
    
    
    TOTAL_SLOTS: 5,          

   
    TEMP_LIMIT: 30,          
    PM25_LIMIT: 50,          
    
    
    PATH_SENSORS: "sensors/environment",
    PATH_STATUS: "parking_status"
};


const firebaseConfig = {
    apiKey: "AIzaSyBnlGJ_Mm1fd9Liy1_sCjOuz4Diyf3Puec",
    authDomain: "parking-project-4a055.firebaseapp.com",
    databaseURL: "https://parking-project-4a055-default-rtdb.firebaseio.com",
    projectId: "parking-project-4a055",
    storageBucket: "parking-project-4a055.firebasestorage.app",
    messagingSenderId: "232721073325",
    appId: "1:232721073325:web:61338401d09a1ee20bf224",
    measurementId: "G-9HBP0SZTP9"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ============================================
// 2. ฟังก์ชันเริ่มทำงาน (Setup)
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    console.log("System Ready...");
    console.log(`Connecting to Pi at ${CONFIG.PI_IP}:${CONFIG.PI_PORT}`);
    
    // (Optional) ถ้าอยากให้เปลี่ยน URL รูปกล้องใน HTML อัตโนมัติด้วย ให้เปิดบรรทัดนี้
    // setupCameraFeed(); 
});

// ฟังก์ชันตั้งค่ารูปกล้องอัตโนมัติ (แถมให้ เผื่ออาจารย์ให้เปลี่ยน IP กล้องหน้างาน)
function setupCameraFeed() {
    const imgElement = document.getElementById("main-camera-feed");
    if(imgElement) {
        imgElement.src = `http://${CONFIG.PI_IP}:${CONFIG.PI_PORT}/video_feed`;
    }
}

// ============================================
// 3. รับค่า Sensor และเปลี่ยนสีแจ้งเตือน
// ============================================
const sensorRef = db.ref(CONFIG.PATH_SENSORS);
sensorRef.on("value", (snapshot) => {
    const data = snapshot.val() || {};

    // อัปเดตค่าและเช็คสีแจ้งเตือน
    updateSensorUI("pressure-value", data.pressure, null); // ความดันไม่มีแจ้งเตือน
    updateSensorUI("temp-value", data.temperature, CONFIG.TEMP_LIMIT);
    updateSensorUI("humid-value", data.humidity, null);
    updateSensorUI("air-value", data.air, CONFIG.PM25_LIMIT);
    
    document.getElementById("time-value").textContent = data.time ?? "--:--:--";
});

// ฟังก์ชันช่วยเปลี่ยนสี (Logic แยกออกมาเพื่อให้ดูโปร)
function updateSensorUI(elementId, value, limit) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.textContent = value ?? "N/A";

    // ถ้ามีการตั้งค่า Limit และค่าเกินกำหนด -> เปลี่ยนสีแดง
    if (limit !== null && value > limit) {
        el.style.color = "#ef4444"; // สีแดง
        el.style.fontWeight = "bold";
    } else {
        el.style.color = ""; // สีเดิม
        el.style.fontWeight = "";
    }
}

// ============================================
// 4. รับสถานะช่องจอดรถ (Loop ตาม Config)
// ============================================
const parkingRef = db.ref(CONFIG.PATH_STATUS);
parkingRef.on("value", (snapshot) => {
    const statusData = snapshot.val() || {};

    // วนลูปตามจำนวนช่องที่ตั้งใน CONFIG (ไม่ต้องแก้เลข Loop เองแล้ว)
    for (let i = 1; i <= CONFIG.TOTAL_SLOTS; i++) {
        // จัดรูปแบบเลขให้เป็น 01, 02 (เติม 0 ข้างหน้าถ้าเลขหลักเดียว)
        const slotNum = i < 10 ? '0' + i : i; 
        
        const isOccupied = statusData[`slot_${i}`]; 
        const elementId = `p-${slotNum}`; // เช่น p-01, p-02

        const el = document.getElementById(elementId);
        if (el) {
            if (isOccupied) {
                // มีรถ
                el.classList.remove("available");
                el.classList.add("occupied");
            } else {
                // ว่าง
                el.classList.remove("occupied");
                el.classList.add("available");
            }
        }
    }
});

// ============================================
// 5. ฟังก์ชันควบคุมกล้อง (ดึง IP จาก Config)
// ============================================
function controlCamera(action) {
    // สร้าง URL จาก Config 
    const url = `http://${CONFIG.PI_IP}:${CONFIG.PI_PORT}/camera/${action}`;
    
    console.log(`Sending command: ${action} -> ${url}`);

    fetch(url)
        .then(response => response.text())
        .then(data => {
            console.log("Pi Response:", data);
        })
        .catch(error => {
            console.error('Error:', error);
            // แจ้งเตือนผู้ใช้ (เผื่อสายหลุด)
            alert(`เชื่อมต่อกล้องไม่ได้! ตรวจสอบ IP: ${CONFIG.PI_IP}`);
        });
}