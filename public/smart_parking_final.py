from flask import Flask, Response
from flask_cors import CORS
import cv2
import time
import requests
import threading
from ultralytics import YOLO

import board
import busio
import adafruit_bme680
import pyrebase
import RPi.GPIO as GPIO
import pigpio  # 🟢 [เพิ่ม] Library ใหม่สำหรับ Servo นิ่งๆ

# ============================================
# 1. ตั้งค่าระบบและ GPIO
# ============================================

TELEGRAM_TOKEN = "8486502780:AAFCDwKb_-07XdmXIwYRoXCnS3PjyBdzlxU"
TELEGRAM_CHAT_ID = "8524258844"

TARGET_OBJECTS = ["car", "truck", "bus"]
ALERT_COOLDOWN = 15
FRAME_SKIP = 15

# ตั้งค่า GPIO สำหรับ Sensor (ใช้ RPi.GPIO เหมือนเดิม)
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# --------------------------------------------
# ⚙️ ตั้งค่า Servo (MG996R) และ Flame Sensor
# --------------------------------------------
SERVO_PIN = 18   # ขา PWM (Pin 12)
FLAME_PIN = 17   # ขา Digital (Pin 11)

# Setup Flame Sensor
GPIO.setup(FLAME_PIN, GPIO.IN)

# 🟢 [แก้ไขใหม่] Setup Servo ด้วย pigpio (นิ่งกว่ามาก)
pi = pigpio.pi()
if not pi.connected:
    print("❌ ไม่สามารถเชื่อมต่อ pigpio daemon ได้ (อย่าลืมพิมพ์ 'sudo pigpiod' ใน Terminal)")
    exit()

# กำหนดช่วง Pulse Width ของ MG996R (500-2500 คือมาตรฐาน 0-180 องศา)
pi.set_mode(SERVO_PIN, pigpio.OUTPUT)
pi.set_servo_pulsewidth(SERVO_PIN, 1500) # เริ่มที่ตรงกลาง (90 องศา)

# ตัวแปรควบคุมโหมด Auto ของ Servo
auto_mode_active = False

# ============================================
# 2. ตั้งค่าโซนจอดรถ
# ============================================
PARKING_ZONES = [
    {"id": "P_1", "coords": [50, 200, 150, 450]},  
    {"id": "P_2", "coords": [160, 200, 260, 450]}, 
    {"id": "P-3", "coords": [270, 200, 370, 450]}, 
    {"id": "P-4", "coords": [380, 200, 480, 450]}, 
    {"id": "P-5", "coords": [490, 200, 590, 450]}  
]

last_parking_status = {
    "P-1": False, "P-2": False, "P-3": False, "P-4": False, "P-5": False
}

# ============================================
# 3. ตั้งค่า Firebase & Sensors
# ============================================
firebase_config = {
    "apiKey": "AIzaSyBnlGJ_Mm1fd9Liy1_sCjOuz4Diyf3Puec",
    "authDomain": "parking-project-4a055.firebaseapp.com",
    "databaseURL": "https://parking-project-4a055-default-rtdb.firebaseio.com",
    "storageBucket": "parking-project-4a055.firebasestorage.app"
}

try:
    firebase = pyrebase.initialize_app(firebase_config)
    db = firebase.database()
    print("✅ เชื่อมต่อ Firebase สำเร็จ")
except Exception as e:
    print(f"❌ เชื่อมต่อ Firebase ไม่ได้: {e}")
    db = None

bme680 = None
try:
    i2c = busio.I2C(board.SCL, board.SDA)
    bme680 = adafruit_bme680.Adafruit_BME680_I2C(i2c)
    print("✅ BME680 พร้อมใช้งาน")
except Exception as e:
    print(f"❌ ไม่พบเซ็นเซอร์ BME680: {e}")

# ============================================
# 4. เริ่มต้น App และโหลดโมเดล AI
# ============================================
app = Flask(__name__)
CORS(app)

print("⏳ โหลดโมเดลจับรถ (YOLOv8n)...")
model = YOLO("yolov8n.pt") 

print("⏳ โหลดโมเดลป้ายทะเบียน...")
try:
    plate_model = YOLO("license_plate_detector.pt") 
    print("✅ โหลดโมเดลป้ายทะเบียนสำเร็จ")
except Exception as e:
    print(f"❌ ไม่พบไฟล์โมเดลป้ายทะเบียน: {e}")
    plate_model = None 

last_alert_time = 0
camera = cv2.VideoCapture(0)
camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
camera.set(cv2.CAP_PROP_FPS, 30)

# ============================================
# 5. ฟังก์ชันควบคุม Servo (แบบใหม่ ใช้ pigpio)
# ============================================
def set_servo_angle(angle):
    """ฟังก์ชันหมุน Servo แบบนิ่ง (0-180 องศา)"""
    # แปลงองศา (0-180) เป็น Pulse Width (500-2500)
    # สูตร: 500 + (angle / 180) * 2000
    pulse = 500 + (angle / 180.0) * 2000
    
    # สั่งหมุน (Hardware PWM นิ่งกริบ)
    pi.set_servo_pulsewidth(SERVO_PIN, pulse)
    
    time.sleep(0.5) # รอให้หมุนถึงที่ (ปรับให้น้อยลงได้ถ้าอยากให้เร็ว)
    
    # ตัดสัญญาณเมื่อถึงที่ (มอเตอร์จะฟรีและหยุดสั่น 100%)
    pi.set_servo_pulsewidth(SERVO_PIN, 0)

def auto_scan_loop():
    global auto_mode_active
    print("🔄 เริ่มโหมด Auto Scan...")
    while auto_mode_active:
        steps = [0, 90, 180, 90]
        for angle in steps:
            if not auto_mode_active: break
            set_servo_angle(angle)
            time.sleep(1) # พักระหว่างจุด
    print("⏹️ จบโหมด Auto Scan")

@app.route('/camera/<action>')
def control_camera(action):
    global auto_mode_active
    
    if action in ['left', 'center', 'right']:
        auto_mode_active = False 
        time.sleep(0.1) 

    if action == 'left':
        set_servo_angle(170)
        return "Left"
    elif action == 'center':
        set_servo_angle(90)
        return "Center"
    elif action == 'right':
        set_servo_angle(10)
        return "Right"
    elif action == 'auto':
        if not auto_mode_active:
            auto_mode_active = True
            t = threading.Thread(target=auto_scan_loop)
            t.start()
            return "Auto Mode ON"
        else:
            auto_mode_active = False
            return "Auto Mode OFF"
            
    return "Unknown Command"

# ============================================
# 6. ฟังก์ชันแจ้งเตือน Telegram
# ============================================
def send_telegram_thread(image, object_name):
    try:
        img_small = cv2.resize(image, (640, 480))
        _, img_encoded = cv2.imencode('.jpg', img_small)
        files = {'photo': ('alert.jpg', img_encoded.tobytes())}
        caption = f"🚨 แจ้งเตือน: พบ {object_name}!"
        data = {'chat_id': TELEGRAM_CHAT_ID, 'caption': caption}
        requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto", files=files, data=data)
        print(f">> ส่ง Telegram รูปภาพสำเร็จ: {object_name}")
    except Exception as e:
        print(f"❌ Telegram Error: {e}")

def trigger_alert(frame_img, object_name):
    global last_alert_time
    current_time = time.time()
    if current_time - last_alert_time > ALERT_COOLDOWN:
        last_alert_time = current_time
        t = threading.Thread(target=send_telegram_thread, args=(frame_img.copy(), object_name))
        t.start()

# ============================================
# 7. Thread ตรวจจับไฟไหม้
# ============================================
def fire_detection_loop():
    print("🔥 Fire Detection Active... (Standby)")
    is_alerting = False 
    while True:
        try:
            if GPIO.input(FLAME_PIN) == 0: 
                if not is_alerting: 
                    print("🚨 FIRE DETECTED! ไฟไหม้!")
                    is_alerting = True
                    if db: db.child("sensors/status").update({"fire_alert": True})
                    try:
                        msg = "🔥🔥🔥 แจ้งเตือนด่วน! ตรวจพบเปลวไฟที่ลานจอดรถ! 🔥🔥🔥"
                        requests.get(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage?chat_id={TELEGRAM_CHAT_ID}&text={msg}")
                        print(">> ส่ง Telegram แจ้งไฟไหม้แล้ว")
                    except Exception as e:
                        print(f"Telegram Error: {e}")
                    time.sleep(15) 
                    is_alerting = False
            else:
                if db: db.child("sensors/status").update({"fire_alert": False})
                time.sleep(0.5)
        except Exception as e:
            print(f"Fire Loop Error: {e}")
            time.sleep(1)

fire_thread = threading.Thread(target=fire_detection_loop, daemon=True)
fire_thread.start()

# ============================================
# 8. Thread BME680
# ============================================
def sensor_loop():
    print("🌡️ เริ่มอ่านค่าจาก BME680...")
    while True:
        try:
            if bme680 and db:
                temp = bme680.temperature
                humidity = bme680.humidity
                pressure = bme680.pressure
                gas = bme680.gas / 1000
                data = {
                    "temperature": f"{temp:.2f}",
                    "humidity": f"{humidity:.2f}",
                    "pressure": f"{pressure:.2f}",
                    "air": f"{gas:.1f}",
                    "time": time.strftime("%H:%M:%S")
                }
                db.child("sensors/environment").set(data)
        except Exception as e:
            print(f"Sensor Error: {e}")
        time.sleep(10)

sensor_thread = threading.Thread(target=sensor_loop, daemon=True)
sensor_thread.start()

# ============================================
# 9. ฟังก์ชันเช็คที่จอดรถ
# ============================================
def check_parking_status(detected_boxes):
    global last_parking_status
    current_status = {"P-1": False, "P-2": False, "P-3": False, "P-4": False, "P-5": False}

    for (x1, y1, x2, y2, _) in detected_boxes:
        cx = int((x1 + x2) / 2)
        cy = int((y1 + y2) / 2)
        for zone in PARKING_ZONES:
            zx1, zy1, zx2, zy2 = zone["coords"]
            if zx1 < cx < zx2 and zy1 < cy < zy2:
                current_status[zone["id"]] = True

    if current_status != last_parking_status:
        try:
            print(f"🔄 Parking Update: {current_status}")
            if db: db.child("parking_status").update(current_status)
            last_parking_status = current_status.copy()
        except Exception as e:
            print(f"Firebase Update Error: {e}")
            
    return current_status

# ============================================
# 10. ลูปประมวลผลภาพหลัก
# ============================================
def generate_frames():
    frame_count = 0
    current_boxes = [] 
    current_plate_box = None

    while True:
        success, frame = camera.read()
        if not success: break
        frame_count += 1

        if frame_count % FRAME_SKIP == 0:
            current_boxes = []
            current_plate_box = None
            
            results = model(frame, stream=True, verbose=False, conf=0.25, imgsz=640)
            
            largest_vehicle_area = 0
            largest_vehicle_coords = None
            largest_vehicle_name = ""

            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    class_name = model.names[cls_id]

                    if class_name in TARGET_OBJECTS:
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        current_boxes.append((x1, y1, x2, y2, class_name))
                        
                        area = (x2 - x1) * (y2 - y1)
                        if area > largest_vehicle_area:
                            largest_vehicle_area = area
                            largest_vehicle_coords = (x1, y1, x2, y2)
                            largest_vehicle_name = class_name
            
            check_parking_status(current_boxes)

            if largest_vehicle_coords and plate_model:
                lx1, ly1, lx2, ly2 = largest_vehicle_coords
                if (lx2 - lx1) > 80 and (ly2 - ly1) > 80:
                    vehicle_roi = frame[ly1:ly2, lx1:lx2]
                    try:
                        plate_results = plate_model(vehicle_roi, verbose=False, conf=0.3)
                        for pr in plate_results:
                            for pbox in pr.boxes:
                                px1, py1, px2, py2 = map(int, pbox.xyxy[0])
                                real_px1, real_py1 = lx1 + px1, ly1 + py1
                                real_px2, real_py2 = lx1 + px2, ly1 + py2
                                current_plate_box = (real_px1, real_py1, real_px2, real_py2)
                                
                                trigger_alert(frame, f"{largest_vehicle_name} และ ป้ายทะเบียน")
                                break 
                    except Exception as e:
                        print(f"Plate Detection Error: {e}")

        # --- ส่วนวาดภาพ ---
        for zone in PARKING_ZONES:
            zx1, zy1, zx2, zy2 = zone["coords"]
            slot_id = zone["id"]
            is_occupied = last_parking_status.get(slot_id, False)
            color = (0, 0, 255) if is_occupied else (0, 255, 0)
            cv2.rectangle(frame, (zx1, zy1), (zx2, zy2), color, 2)
            cv2.putText(frame, slot_id, (zx1, zy1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        for (x1, y1, x2, y2, name) in current_boxes:
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(frame, name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        if current_plate_box:
            px1, py1, px2, py2 = current_plate_box
            cv2.rectangle(frame, (px1, py1), (px2, py2), (0, 255, 255), 3)

        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

# ============================================
# 11. Start Flask
# ============================================
@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/')
def index():
    return "<h1>Smart Parking AI + Fire Safety Running...</h1>"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)