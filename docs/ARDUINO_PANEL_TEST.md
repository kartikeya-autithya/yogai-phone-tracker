# Arduino Control Panel — test checklist

Mark an item only after you have run it on the phone. Keep the phone detached from the mount and the servos clear for the first pass.

## Navigation
- [ ] The Camera screen shows an **Arduino Control Panel** button with a NOT CONNECTED pill.
- [ ] Tapping it opens the panel. The top bar shows **← Back to Camera**.
- [ ] **← Back to Camera** (top bar and bottom button) returns to the camera screen.
- [ ] The Android back gesture on the panel returns to the camera screen instead of leaving the app.
- [ ] Your scroll position on the camera screen is restored after returning.

## Nothing is interrupted by switching
- [ ] Start the camera, confirm the skeleton appears, open the panel, return: the video is still live and the FPS value is still updating.
- [ ] Connect the Arduino, switch views several times: it stays connected and the pill stays CONNECTED.
- [ ] Jog a servo, open and close the panel: the yaw/tilt values still match the servo position.
- [ ] Change a response slider, switch views: the setting is unchanged.

## Panel controls
- [ ] Connection method reads WebUSB (Android) before and after connecting.
- [ ] Connect, Disconnect, and Connect via WebUSB behave as before.
- [ ] A failed connection leaves a red "Last error" line; a later successful connection clears it.
- [ ] Yaw and tilt tiles and position bars follow manual jogs.
- [ ] Centre servos works; Start and Stop servo tracking work; Stop servo tracking on the camera screen also stops tracking.
- [ ] With the camera off, the hint says to go back and start the camera.
- [ ] All buttons are comfortable to tap and nothing overflows the screen on the Galaxy A14.
