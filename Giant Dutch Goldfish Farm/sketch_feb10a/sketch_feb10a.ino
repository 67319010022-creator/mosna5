#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h> // สำหรับ Telegram SSL
#include <FirebaseESP8266.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>

// --- 10.1 ตั้งค่า Wi-Fi ---
#define WIFI_SSID "iPhone ของ Nithithat"
#define WIFI_PASSWORD "Scarlett13"

// --- 10.2 ตั้งค่า Firebase ---
#define FIREBASE_HOST "giant-dutch-goldfish-farm-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "MdYlFx4HtdyDWLXLJ38SfK4TLYgfzz8ufs2iJ95u"

#define BOTtoken "8336056270:AAGKp895BRFx93UTlUZUvLjhmnpAknw9ck8"
#define CHAT_ID "8524258844"

FirebaseData firebaseData;
FirebaseConfig config;
FirebaseAuth auth;

WiFiClientSecure client;
UniversalTelegramBot bot(BOTtoken, client);

unsigned long lastSendTime = 0;
unsigned long lastTimeBotRan = 0;
const int botRequestDelay = 1000; // เช็กข้อความ Telegram ทุก 1 วินาที

// ฟังก์ชันจัดการคำสั่งจาก Telegram (11.1 - 11.7)
void handleNewMessages(int numNewMessages) {
  for (int i = 0; i < numNewMessages; i++) {
    String chat_id = String(bot.messages[i].chat_id);
    if (chat_id != CHAT_ID) continue; // รับคำสั่งเฉพาะเราเท่านั้น

    String text = bot.messages[i].text;
    String reply = "";

    if (text == "/stemp") { // 11.2
      Firebase.getFloat(firebaseData, "/sensor/temp");
      reply = "อุณหภูมิปัจจุบัน : " + String(firebaseData.floatData()) + " °C";
    } 
    else if (text == "/shumid") { // 11.3
      Firebase.getFloat(firebaseData, "/sensor/humid");
      reply = "ความชื้นปัจจุบัน : " + String(firebaseData.floatData()) + " %";
    }
    else if (text == "/ctemp") { // 11.4
      Firebase.getFloat(firebaseData, "/condition/temp");
      reply = "เงื่อนไขอุณหภูมิ : " + String(firebaseData.floatData()) + " °C";
    }
    else if (text == "/chumid") { // 11.5
      Firebase.getFloat(firebaseData, "/condition/humid");
      reply = "เงื่อนไขความชื้น : " + String(firebaseData.floatData()) + " %";
    }
    else if (text == "/all") { // 11.1
      float st, sh, ct, ch;
      Firebase.getFloat(firebaseData, "/sensor/temp"); st = firebaseData.floatData();
      Firebase.getFloat(firebaseData, "/sensor/humid"); sh = firebaseData.floatData();
      Firebase.getFloat(firebaseData, "/condition/temp"); ct = firebaseData.floatData();
      Firebase.getFloat(firebaseData, "/condition/humid"); ch = firebaseData.floatData();
      reply = "📊 ข้อมูลทั้งหมด\n";
      reply += "🌡 Sensor Temp: " + String(st) + " °C\n";
      reply += "💧 Sensor Humid: " + String(sh) + " %\n";
      reply += "⚙️ Cond Temp: " + String(ct) + " °C\n";
      reply += "⚙️ Cond Humid: " + String(ch) + " %";
    }
    else if (text == "/on") { // 11.6
      digitalWrite(LED_BUILTIN, LOW); 
      Firebase.setInt(firebaseData, "/switch/status", 1);
      reply = "เปิดไฟ LED และอัปเดตหน้าเว็บแล้ว 💡";
    }
    else if (text == "/off") { // 11.7
      digitalWrite(LED_BUILTIN, HIGH);
      Firebase.setInt(firebaseData, "/switch/status", 0);
      reply = "ปิดไฟ LED และอัปเดตหน้าเว็บแล้ว 🌑";
    }

    if (reply != "") bot.sendMessage(chat_id, reply, "");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  client.setInsecure(); // จำเป็นสำหรับ Telegram บน ESP8266

  // เชื่อมต่อ Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nWiFi Connected!");

  // เริ่มต้น Firebase
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  // --- 10.3 ส่งข้อมูลสุ่มและบันทึกประวัติทุก 10 วินาที ---
  if (millis() - lastSendTime > 10000) {
    lastSendTime = millis();
    float temp = random(250, 351) / 10.0;
    float humid = random(550, 851) / 10.0;

    Firebase.setFloat(firebaseData, "/sensor/temp", temp);
    Firebase.setFloat(firebaseData, "/sensor/humid", humid);

    FirebaseJson json;
    json.add("temp", temp);
    json.add("humid", humid);
    Firebase.pushJSON(firebaseData, "/logs", json);
    Serial.println("Pushed to logs: " + String(temp) + "C, " + String(humid) + "%");
  }

  // --- 11. ตรวจสอบข้อความ Telegram ---
  if (millis() > lastTimeBotRan + botRequestDelay) {
    int numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    while (numNewMessages) {
      handleNewMessages(numNewMessages);
      numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    }
    lastTimeBotRan = millis();
  }

  // --- 10.4 อ่านสถานะปุ่มจากหน้าเว็บ (Sync กับเว็บ) ---
  if (Firebase.getInt(firebaseData, "/switch/status")) {
    int swStatus = firebaseData.intData();
    digitalWrite(LED_BUILTIN, (swStatus == 1) ? LOW : HIGH);
  }

  delay(10); 
}