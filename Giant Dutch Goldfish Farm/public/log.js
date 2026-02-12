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

const msgTag = document.getElementById('msg');

// ฟังก์ชันเข้าสู่ระบบ (Login)
function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            window.location.href = "index.html";
        })
        .catch((error) => {
            msgTag.innerText = "Error: " + error.message;
            msgTag.className = "text-danger mt-2";
        });
}

// ฟังก์ชันสมัครสมาชิก (Register)
function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (confirm("ยืนยันการสมัครสมาชิกด้วยอีเมลนี้ใช่หรือไม่?")) {
        firebase.auth().createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                msgTag.innerText = "สมัครสมาชิกสำเร็จ! กำลังพาไปหน้าหลัก...";
                msgTag.className = "text-success mt-2";
                setTimeout(() => { window.location.href = "index.html"; }, 2000);
            })
            .catch((error) => {
                msgTag.innerText = "สมัครไม่สำเร็จ: " + error.message;
                msgTag.className = "text-danger mt-2";
            });
    }
}