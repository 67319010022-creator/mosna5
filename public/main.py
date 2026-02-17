import cv2              
import time             
import requests         
import threading        
import copy             
import random  
import os   
import sys
from flask import Flask, Response, render_template 
from flask_cors import CORS  
from ultralytics import YOLO 
import pyrebase

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
print(f"📂 Working Directory fixed to: {BASE_DIR}")


try:
    import RPi.GPIO as GPIO      
    import pigpio                
    import board                  
    import busio                  
    import adafruit_bme680        
    HARDWARE_AVAILABLE = True     
except ImportError:
    print("⚠️ ไม่เจอไลบรารีฮาร์ดแวร์ -> โหมดจำลอง")
    HARDWARE_AVAILABLE = False   


TELEGRAM_TOKEN = "8486502780:AAFCDwKb_-07XdmXIwYRoXCnS3PjyBdzlxU" 
TELEGRAM_CHAT_ID = "8524258844"                                   


firebase_config = {
    "apiKey": "AIzaSyBnlGJ_Mm1fd9Liy1_sCjOuz4Diyf3Puec",
    "authDomain": "parking-project-4a055.firebaseapp.com",
    "databaseURL": "https://parking-project-4a055-default-rtdb.firebaseio.com",
    "storageBucket": "parking-project-4a055.firebasestorage.app"
}


SERVO_PIN = 18   
FLAME_PIN = 17   
BUTTON_PIN = 21 

# --- ตั้งค่า AI ---
TARGET_OBJECTS = ["car", "truck", "bus"] 
ALERT_COOLDOWN = 15                     

PARKING_ZONES = [
    {"id": "slot_1", "coords": [25, 80, 205, 415]},    
    {"id": "slot_2", "coords": [230, 80, 410, 415]},   
    {"id": "slot_3", "coords": [435, 80, 615, 415]},   
]

# ==============================================================================
# SETUP SYSTEM
# ==============================================================================
print("⏳ System Starting...")

pi = None
bme680 = None

if HARDWARE_AVAILABLE:
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(FLAME_PIN, GPIO.IN) 
    
    
    GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    
    pi = pigpio.pi()
    if pi.connected:
        pi.set_mode(SERVO_PIN, pigpio.OUTPUT)
        pi.set_servo_pulsewidth(SERVO_PIN, 1500) 
    
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        bme680 = adafruit_bme680.Adafruit_BME680_I2C(i2c)
    except: pass

try:
    firebase = pyrebase.initialize_app(firebase_config)
    db = firebase.database()
except Exception as e:
    print(f"❌ Firebase Error: {e}")
    db = None


print("⏳ Loading Models...")
yolo_path = os.path.join(BASE_DIR, "yolov8n.pt")
plate_path = os.path.join(BASE_DIR, "license_plate_detector.pt")

try:
    model = YOLO(yolo_path)                  
    plate_model = YOLO(plate_path) 
    print("✅ All Models Loaded Successfully")
except Exception as e:
    print(f"❌ Error loading models: {e}")
    model = YOLO("yolov8n.pt") 
    plate_model = None

# เปิดกล้อง
time.sleep(2) 
camera = cv2.VideoCapture(0)
camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)  
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

# ==============================================================================
# GLOBAL VARIABLES
# ==============================================================================
app = Flask(__name__)
CORS(app)

data_lock = threading.Lock()
global_frame = None            
global_boxes = []              
global_plate_list = []         
global_parking_status = {"slot_1": False, "slot_2": False, "slot_3": False} 
last_uploaded_status = {}      
auto_mode_active = False       
last_alert_times = {}  


system_running = False 

# ==============================================================================
# 🟢 ส่วนสำคัญ 2: ระบบปุ่มกด (Switch Toggle)
# ==============================================================================
def button_monitor_loop():
    global system_running
    print("🔘 Button Monitor Started... (Press to Toggle ON/OFF)")
    
    last_state = 1 # สถานะปุ่มรอบที่แล้ว (1 = ไม่กด)
    
    while True:
        if HARDWARE_AVAILABLE:
            current_state = GPIO.input(BUTTON_PIN)
            
            # ถ้ามีการกดปุ่ม (เปลี่ยนจาก 1 เป็น 0)
            if last_state == 1 and current_state == 0:
                print("... Button Pressed ...")
                
                # สลับสถานะ (Toggle)
                system_running = not system_running 
                
                if system_running:
                    print("\n🟢 SYSTEM STARTED (ระบบเริ่มทำงาน) 🟢\n")
                    if pi and pi.connected: pi.set_servo_pulsewidth(SERVO_PIN, 1500) # หันกล้องตรงกลาง
                else:
                    print("\n🔴 SYSTEM STANDBY (ระบบหยุดพัก) 🔴\n")
                
                # รอจนกว่าจะปล่อยมือ (ป้องกันการรัว)
                while GPIO.input(BUTTON_PIN) == 0:
                    time.sleep(0.1)
                
                time.sleep(0.2) # Debounce
            
            last_state = current_state
        time.sleep(0.05)

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def set_servo_angle(angle):
    if not system_running: return # ถ้าปิดระบบ ห้ามขยับ
    if pi and pi.connected:
        pulse = 500 + (angle / 180.0) * 2000
        pi.set_servo_pulsewidth(SERVO_PIN, pulse)
        time.sleep(0.3)

def auto_scan_loop():
    global auto_mode_active
    steps = [30, 90, 150, 90] 
    while auto_mode_active and system_running:
        for angle in steps:
            if not auto_mode_active or not system_running: break
            set_servo_angle(angle)
            time.sleep(2.0)

def send_telegram_text(text):
    if not system_running: return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        data = {'chat_id': TELEGRAM_CHAT_ID, 'text': f"🔥 {text}"}
        requests.post(url, data=data)
    except: pass

def send_telegram_image(image, text):
    if not system_running: return
    try:
        if image.shape[1] > 600: image = cv2.resize(image, (640, 480))
        _, img_encoded = cv2.imencode('.jpg', image) 
        files = {'photo': ('alert.jpg', img_encoded.tobytes())}
        data = {'chat_id': TELEGRAM_CHAT_ID, 'caption': f"📸 {text}"}
        requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto", files=files, data=data)
    except: pass

def trigger_car_alert(frame, text, key_id):
    if frame is None or not system_running: return 
    global last_alert_times
    current_time = time.time()
    last_time = last_alert_times.get(key_id, 0)
    if current_time - last_time > ALERT_COOLDOWN:
        last_alert_times[key_id] = current_time 
        found_zone = next((z for z in PARKING_ZONES if z["id"] == key_id), None)
        image_to_send = frame.copy()
        if found_zone:
            zx1, zy1, zx2, zy2 = found_zone["coords"]
            h, w = frame.shape[:2]
            zx1, zy1, zx2, zy2 = max(0, zx1), max(0, zy1), min(w, zx2), min(h, zy2)
            image_to_send = frame[zy1:zy2, zx1:zx2]
        threading.Thread(target=send_telegram_image, args=(image_to_send, text)).start()

# ==============================================================================
# MAIN LOGIC LOOPS
# ==============================================================================

def ai_processing_loop():
    global global_boxes, global_plate_list, global_parking_status, last_uploaded_status
    
    while True:
        # 🔴 ถ้าปิดสวิตช์ ให้ข้ามการทำงานไปเลย
        if not system_running:
            # ล้างค่าให้หน้าจอว่างเปล่าตอนปิด
            with data_lock:
                global_boxes = []
                global_plate_list = []
            time.sleep(0.5)
            continue

        if global_frame is None: 
            time.sleep(0.1)
            continue

        with data_lock:
            frame_to_process = global_frame.copy()

        # 1. Detect Car
        results = model(frame_to_process, verbose=False, conf=0.30, imgsz=640)
        temp_boxes = []
        for r in results:
            for box in r.boxes:
                name = model.names[int(box.cls[0])]
                if name in TARGET_OBJECTS: 
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    temp_boxes.append((x1, y1, x2, y2, name))

        # 2. Check Parking
        temp_status = {k: False for k in global_parking_status}
        for (x1, y1, x2, y2, _) in temp_boxes:
            cx, cy = (x1+x2)//2, (y1+y2)//2 
            for zone in PARKING_ZONES:
                zx1, zy1, zx2, zy2 = zone["coords"]
                if min(zx1, zx2) < cx < max(zx1, zx2) and min(zy1, zy2) < cy < max(zy1, zy2):
                    temp_status[zone["id"]] = True
        
        if temp_status != last_uploaded_status:
            if db: db.child("parking_status").update(temp_status)
            last_uploaded_status = temp_status.copy()

        # 3. Detect Plate
        temp_plates_found = []
        if plate_model:
            for (lx1, ly1, lx2, ly2, veh_name) in temp_boxes:
                if (lx2 - lx1) > 20: 
                    try:
                        roi = frame_to_process[ly1:ly2, lx1:lx2] 
                        p_res = plate_model(roi, verbose=False, conf=0.25)
                        for pr in p_res:
                            for pb in pr.boxes:
                                px1, py1, px2, py2 = map(int, pb.xyxy[0])
                                real_plate = (lx1+px1, ly1+py1, lx1+px2, ly1+py2)
                                temp_plates_found.append(real_plate)
                                plate_cx = (real_plate[0] + real_plate[2]) // 2
                                plate_cy = (real_plate[1] + real_plate[3]) // 2
                                for zone in PARKING_ZONES:
                                    zx1, zy1, zx2, zy2 = zone["coords"]
                                    if min(zx1, zx2) < plate_cx < max(zx1, zx2) and min(zy1, zy2) < plate_cy < max(zy1, zy2):
                                        trigger_car_alert(frame_to_process, f"ทะเบียนรถ ({zone['id']})", zone['id'])
                                        break
                    except: pass

        with data_lock:
            global_boxes = temp_boxes
            global_parking_status = temp_status
            global_plate_list = temp_plates_found
        
        time.sleep(0.01)

def sensor_loop():
    global last_alert_times
    while True:
        # 🔴 ถ้าปิดสวิตช์ ให้ข้ามเซนเซอร์
        if not system_running:
            time.sleep(1)
            continue
            
        try:
            if HARDWARE_AVAILABLE:
                fire_detected = (GPIO.input(FLAME_PIN) == 0) 
            else: fire_detected = False

            if fire_detected:
                current_time = time.time()
                key_id = "fire_sensor"
                last_time = last_alert_times.get(key_id, 0)
                if current_time - last_time > ALERT_COOLDOWN:
                    last_alert_times[key_id] = current_time
                    threading.Thread(target=send_telegram_text, args=("อันตราย! ตรวจพบเปลวไฟ!",)).start()
                    if db: db.child("sensors/status").update({"fire_alert": True})
            else:
                if db: db.child("sensors/status").update({"fire_alert": False})

            if db:
                temp_val = random.uniform(28, 32)
                hum_val = random.uniform(50, 60)
                if bme680:
                    try:
                        temp_val = bme680.temperature
                        hum_val = bme680.relative_humidity
                    except: pass 
                data = {
                    "temperature": f"{temp_val:.1f}",
                    "humidity": f"{hum_val:.1f}",
                    "air": f"{random.uniform(10,50):.0f}",
                    "pressure": f"{random.uniform(1000,1020):.0f}",
                    "time": time.strftime("%H:%M:%S")
                }
                db.child("sensors/environment").set(data)
        except: pass
        time.sleep(1)

# ==============================================================================
# WEB SERVER
# ==============================================================================

def generate_frames():
    global global_frame
    while True:
        success, frame = camera.read()
        if not success: break
        
        with data_lock:
            global_frame = frame.copy() 
            display_frame = global_frame.copy()
            boxes = global_boxes
            plates = global_plate_list
            status = global_parking_status

        # ถ้าปิดระบบอยู่ ให้เขียนบอกบนหน้าจอ
        if not system_running:
            # ปรับภาพเป็นขาวดำ หรือ มืดลง เพื่อให้รู้ว่าปิด
            display_frame = cv2.cvtColor(display_frame, cv2.COLOR_BGR2GRAY)
            display_frame = cv2.cvtColor(display_frame, cv2.COLOR_GRAY2BGR)
            cv2.putText(display_frame, "SYSTEM STANDBY (Press Button)", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        else:
            # วาดกรอบต่างๆ เฉพาะตอนเปิดระบบ
            for zone in PARKING_ZONES:
                zx1, zy1, zx2, zy2 = zone["coords"]
                color = (0, 0, 255) if status.get(zone["id"], False) else (0, 255, 0)
                cv2.rectangle(display_frame, (zx1, zy1), (zx2, zy2), color, 2)
            for (x1, y1, x2, y2, name) in boxes:
                cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            for (px1, py1, px2, py2) in plates:
                cv2.rectangle(display_frame, (px1, py1), (px2, py2), (0, 255, 255), 3)

        ret, buffer = cv2.imencode('.jpg', display_frame)
        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        time.sleep(0.04) 

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/camera/<action>')
def control_camera(action):
    global auto_mode_active
    
    # ถ้าปิดสวิตช์อยู่ ห้ามกดสั่งผ่านเว็บ
    if not system_running:
        return "System is OFF. Press button to start."

    if action == 'auto':
        auto_mode_active = not auto_mode_active
        if auto_mode_active: threading.Thread(target=auto_scan_loop).start()
        return "Auto Mode Toggled"
    
    auto_mode_active = False # Manual override
    
    target_angle = 90
    if action == 'left': target_angle = 170
    elif action == 'center': target_angle = 90
    elif action == 'right': target_angle = 10
    
    set_servo_angle(target_angle)
    
    # ❌ ลบส่วน threading.Timer ออกไปแล้ว
    # ตอนนี้กดไปทางไหน ก็จะค้างอยู่ทางนั้นครับ
        
    return f"Moved {action}"

if __name__ == '__main__':
    # รัน Thread ทั้งหมด
    threading.Thread(target=ai_processing_loop, daemon=True).start()
    threading.Thread(target=sensor_loop, daemon=True).start()
    
    # 🔴 รัน Thread ปุ่มกด (สำคัญ!)
    if HARDWARE_AVAILABLE:
        threading.Thread(target=button_monitor_loop, daemon=True).start()
    
    print("🚀 Smart Parking Ready: http://localhost:5000")
    print("🟡 SYSTEM STATUS: STANDBY (Waiting for button press...)")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)