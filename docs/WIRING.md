# Wiring

| Signal | Arduino pin |
|---|---|
| Yaw servo signal | D5 |
| Tilt servo signal | D6 |

- Servo power (red) from an external regulated 5–6 V supply rated 3 A or more (the MG995 needs this; SG90 pairs are lighter but still should not use the Uno 5V pin).
- External supply GND to servo GND and to Arduino GND (common ground).
- A 470–1000 µF capacitor across the servo supply near the servos is recommended.
- Never force a servo against a stop. If it buzzes or strains, cut power and reduce the limits.
- Servos may twitch when power is first applied. Keep the mount clear.
- Test unloaded (phone not attached) first.
