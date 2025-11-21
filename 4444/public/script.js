// script.js (Final Firebase Version)

// ตั้งค่า Firebase โปรเจ็กต์ของคุณ (นำค่าจริงมาใส่)
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// เริ่มต้น Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// path ต้องตรงกับโครงสร้างใน Import.json: sensors/environment
const sensorRef = db.ref("sensors/environment");

// อ่านข้อมูลจาก Firebase แบบเรียลไทม์
sensorRef.on("value", (snapshot) => {
    const data = snapshot.val() || {};

    // อัปเดตค่าแต่ละตัว
    document.getElementById("pressure-value").textContent =
        data.pressure ?? "N/A";

    document.getElementById("temp-value").textContent =
        data.temperature ?? "N/A";

    document.getElementById("humid-value").textContent =
        data.humidity ?? "N/A";

   
});