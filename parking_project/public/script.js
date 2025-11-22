
// ตรงนี้เป็นข้อมูลของโปรเจกต์ Firebase ของคุณ
// เอามาจากหน้า Project Settings → General → SDK setup
// ใช้เชื่อมต่อเว็บกับ Firebase Realtime Database
const firebaseConfig = {
    apiKey: "AIzaSyBnlGJ_Mm1fd9Liy1_sCjOuz4Diyf3Puec",            // กุญแจ API สำหรับอนุญาตให้เว็บเข้าถึง Firebase
    authDomain: "parking-project-4a055.firebaseapp.com",           // โดเมนยืนยันตัวตน
    databaseURL: "https://parking-project-4a055-default-rtdb.firebaseio.com", // URL ของ Realtime Database
    projectId: "parking-project-4a055",                            // ไอดีโปรเจกต์ Firebase
    storageBucket: "parking-project-4a055.firebasestorage.app",    // ที่เก็บไฟล์ Firebase Storage
    messagingSenderId: "232721073325",                             // ไอดีของระบบ Push Notification (ถ้าใช้)
    appId: "1:232721073325:web:61338401d09a1ee20bf224",            // ไอดีของแอปเว็บ
    measurementId: "G-9HBP0SZTP9"                                  // สำหรับ Google Analytics (ไม่จำเป็น)
};

// ---------------------------
// 2) เริ่มต้น Firebase
// ---------------------------
// ใช้ config ด้านบนในการเปิด Firebase
firebase.initializeApp(firebaseConfig);

// สร้างตัวแปร db ไว้เชื่อมต่อฐานข้อมูล
const db = firebase.database();

// ---------------------------
// 3) ชี้ตำแหน่ง Path ใน Realtime Database
// ---------------------------
// ต้องตรงกับโครงสร้างในฐานข้อมูล เช่น:
// sensors
//   └── environment
//         ├── pressure
//         ├── temperature
//         └── humidity
const sensorRef = db.ref("sensors/environment");

// ---------------------------
// 4) ดึงข้อมูลจาก Firebase แบบ Real-time
// ---------------------------
// คำสั่ง .on("value") หมายถึง ให้ติดตามข้อมูลตลอดเวลา
// เมื่อมีการเปลี่ยนแปลง → อัปเดตหน้าเว็บทันที
sensorRef.on("value", (snapshot) => {
    const data = snapshot.val() || {};  // ดึงข้อมูลทั้งหมดใน node นี้

    // ---------------------------
    // 5) อัปเดตค่าในหน้าเว็บ
    // ---------------------------

    // ถ้ามีความดัน → แสดงค่า
    // ถ้าไม่มี → แสดง "N/A"
    document.getElementById("pressure-value").textContent =
        data.pressure ?? "N/A";

    // อุณหภูมิ
    document.getElementById("temp-value").textContent =
        data.temperature ?? "N/A";

    // ความชื้น
    document.getElementById("humid-value").textContent =
        data.humidity ?? "N/A";
});
