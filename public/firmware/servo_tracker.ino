/*
  servo_tracker.ino  -  two-axis servo mount, controlled over USB serial.

  Input line format (115200 baud, newline terminated):   yaw,tilt\n     e.g.  90,90
  Wiring:  YAW servo signal  -> D5
           TILT servo signal -> D6
           Servo power from an EXTERNAL 5-6 V supply (NOT the Uno 5V pin / USB).
           External supply GND must be connected to Arduino GND.

  HOW TO USE: open in Arduino IDE, Tools > Board > Arduino Uno, pick the port, Upload.
  Then connect the YOG AI tracker page / tracker.py over USB.

  Angles are in "mount degrees": yaw 0..YAW_RANGE_DEG, tilt 0..TILT_RANGE_DEG.
  They are converted to pulse widths, so a 270-degree servo can use its full travel.
  Non-blocking: no delay() calls.
*/

#include <Servo.h>

// ===================== CONFIGURATION (edit after physical testing) ==========
const uint8_t YAW_PIN  = 5;
const uint8_t TILT_PIN = 6;

const long SERIAL_BAUD = 115200;

// Full travel the servo is rated for. Set YAW_RANGE_DEG = 180 if your yaw servo
// is a normal 180-degree MG995 (it will strain/buzz if told to go past its stop).
const int YAW_RANGE_DEG  = 180;   // SG90 / standard servo. Use 270 only for a true 270-degree servo
const int TILT_RANGE_DEG = 180;

// Pulse width that corresponds to 0 degrees and to the full range.
const int SERVO_MIN_US = 500;
const int SERVO_MAX_US = 2400;   // SG90 range; MG995 can use 2500

// Software limits (must be inside the ranges above). Start conservative, then
// widen toward 0..180 in small steps after testing the mount.
const int YAW_MIN   = 45;
const int YAW_MAX   = 135;
const int YAW_NEUTRAL = 90;

const int TILT_MIN  = 60;
const int TILT_MAX  = 120;
const int TILT_NEUTRAL = 90;

const float MAX_SPEED_DEG_PER_S = 100.0;     // higher but still slew-limited; tune down if the SG90 chatters
const unsigned long UPDATE_INTERVAL_MS = 20; // servo update period

const bool ECHO_OK = false;                  // true: reply "OK yaw tilt" per command
// ============================================================================

Servo yawServo;
Servo tiltServo;

float yawCurrent  = YAW_NEUTRAL;
float tiltCurrent = TILT_NEUTRAL;
int   yawTarget   = YAW_NEUTRAL;
int   tiltTarget  = TILT_NEUTRAL;

char lineBuf[24];
uint8_t lineLen = 0;
bool lineOverflow = false;
unsigned long lastUpdate = 0;

int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

int angleToUs(float angle, int rangeDeg) {
  float us = SERVO_MIN_US + angle * (float)(SERVO_MAX_US - SERVO_MIN_US) / (float)rangeDeg;
  return (int)(us + 0.5);
}

// Parses "yaw,tilt". Returns false on malformed or out-of-range values.
bool parseLine(const char *s, int &yaw, int &tilt) {
  char *end;
  long a = strtol(s, &end, 10);
  if (end == s || *end != ',') return false;
  const char *p = end + 1;
  long b = strtol(p, &end, 10);
  if (end == p) return false;
  while (*end == ' ') end++;
  if (*end != '\0') return false;
  if (a < 0 || a > YAW_RANGE_DEG || b < 0 || b > TILT_RANGE_DEG) return false;
  yaw = (int)a;
  tilt = (int)b;
  return true;
}

void handleLine() {
  lineBuf[lineLen] = '\0';
  int y, t;
  if (parseLine(lineBuf, y, t)) {
    yawTarget  = clampInt(y, YAW_MIN, YAW_MAX);
    tiltTarget = clampInt(t, TILT_MIN, TILT_MAX);
    if (ECHO_OK) {
      Serial.print(F("OK "));
      Serial.print(yawTarget);
      Serial.print(' ');
      Serial.println(tiltTarget);
    }
  } else {
    Serial.println(F("ERR"));
  }
}

void readSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!lineOverflow && lineLen > 0) handleLine();
      else if (lineOverflow) Serial.println(F("ERR"));
      lineLen = 0;
      lineOverflow = false;
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    } else {
      lineOverflow = true;
    }
  }
}

float moveToward(float cur, float tgt, float maxStep) {
  float d = tgt - cur;
  if (d > maxStep) return cur + maxStep;
  if (d < -maxStep) return cur - maxStep;
  return tgt;
}

void updateServos() {
  unsigned long now = millis();
  unsigned long elapsed = now - lastUpdate;
  if (elapsed < UPDATE_INTERVAL_MS) return;
  lastUpdate = now;

  float maxStep = MAX_SPEED_DEG_PER_S * (float)elapsed / 1000.0;
  yawCurrent  = moveToward(yawCurrent,  (float)yawTarget,  maxStep);
  tiltCurrent = moveToward(tiltCurrent, (float)tiltTarget, maxStep);

  yawServo.writeMicroseconds(angleToUs(yawCurrent, YAW_RANGE_DEG));
  tiltServo.writeMicroseconds(angleToUs(tiltCurrent, TILT_RANGE_DEG));
}

void setup() {
  Serial.begin(SERIAL_BAUD);

  yawServo.attach(YAW_PIN, SERVO_MIN_US, SERVO_MAX_US);
  tiltServo.attach(TILT_PIN, SERVO_MIN_US, SERVO_MAX_US);
  yawServo.writeMicroseconds(angleToUs(YAW_NEUTRAL, YAW_RANGE_DEG));
  tiltServo.writeMicroseconds(angleToUs(TILT_NEUTRAL, TILT_RANGE_DEG));

  lastUpdate = millis();
  Serial.println(F("READY"));
}

void loop() {
  readSerial();
  updateServos();
}
