// Self-contained data module for CLI
// This is a copy of the web app's lib/data to avoid cross-package import issues

export interface DatasheetInfo {
  maxRatings: { parameter: string; value: string }[];
  pinout: string;
  characteristics: {
    parameter: string;
    min?: string;
    typical?: string;
    max?: string;
    unit: string;
  }[];
  partNumbers: string[];
  tips: string;
}

export interface ElectronicsComponent {
  id: string;
  name: string;
  category: 'passive' | 'active' | 'input' | 'output';
  description: string;
  specs: {
    label: string;
    value: string;
  }[];
  circuitExample: string;
  datasheetInfo?: DatasheetInfo;
}

export const electronicsComponents: ElectronicsComponent[] = [
  {
    id: 'resistor',
    name: 'Resistor',
    category: 'passive',
    description:
      'A resistor limits the flow of electrical current in a circuit. Think of it like a narrow section in a water pipe — it slows things down. Resistors protect sensitive components from receiving too much current.',
    specs: [
      { label: 'Resistance', value: '220 Ω (typical for LED circuits)' },
      { label: 'Power Rating', value: '0.25 W' },
      { label: 'Tolerance', value: '± 5%' },
      { label: 'Type', value: 'Carbon Film' },
    ],
    circuitExample:
      'Connect a 220Ω resistor in series with an LED and a 5V power source. The resistor limits current to about 15mA, preventing the LED from burning out.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Power Dissipation', value: '0.25 W' },
        { parameter: 'Operating Temperature', value: '-55°C to +155°C' },
        { parameter: 'Max Working Voltage', value: '250 V' },
      ],
      pinout:
        'Two terminals — non-polarized (either direction works). Read color bands left to right: the tolerance band (gold/silver) is always on the right.',
      characteristics: [
        { parameter: 'Resistance', min: '209', typical: '220', max: '231', unit: 'Ω' },
        { parameter: 'Temperature Coefficient', typical: '±200', unit: 'ppm/°C' },
        { parameter: 'Noise (Current Noise)', max: '-20', unit: 'dB' },
      ],
      partNumbers: ['CFR-25JB-52-220R', 'MFR-25FBF52-220R', 'RC0805JR-07220RL'],
      tips: 'Use the mnemonic "Bad Boys Race Our Young Girls But Violet Generally Wins" for color codes (Black=0, Brown=1 … White=9). For precision circuits, use metal film resistors (blue body, 1% tolerance) instead of carbon film (tan body, 5%).',
    },
  },
  {
    id: 'led',
    name: 'LED',
    category: 'output',
    description:
      'An LED (Light Emitting Diode) produces light when electricity flows through it. Unlike regular bulbs, LEDs are very efficient and last a long time. They only work in one direction — the longer leg (anode) connects to positive.',
    specs: [
      { label: 'Forward Voltage', value: '2.0 V (red)' },
      { label: 'Max Current', value: '20 mA' },
      { label: 'Color', value: 'Red (625 nm)' },
      { label: 'Type', value: '5mm Through-Hole' },
    ],
    circuitExample:
      'Connect the longer leg (anode) through a 220Ω resistor to the Arduino digital pin 13. Connect the shorter leg (cathode) to GND. Use digitalWrite(13, HIGH) to turn it on.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Continuous Forward Current', value: '20 mA' },
        { parameter: 'Peak Forward Current', value: '100 mA (10 µs pulse)' },
        { parameter: 'Reverse Voltage', value: '5 V' },
        { parameter: 'Power Dissipation', value: '75 mW' },
      ],
      pinout:
        'Anode (+) = longer leg. Cathode (−) = shorter leg, flat side of lens. Inside the LED, the larger internal element is the cathode.',
      characteristics: [
        { parameter: 'Forward Voltage (Red)', min: '1.8', typical: '2.0', max: '2.2', unit: 'V' },
        { parameter: 'Forward Current (normal)', typical: '20', unit: 'mA' },
        { parameter: 'Luminous Intensity', typical: '150', unit: 'mcd' },
        { parameter: 'Viewing Angle', typical: '30', unit: '°' },
      ],
      partNumbers: ['LTL-307EE', 'WP7113ID', 'HLMP-D150', '333-2SURC/S400-A9'],
      tips: 'Calculate the resistor value with: R = (Vsupply - Vled) / I. For a 5V Arduino with a red LED (2V): R = (5-2)/0.02 = 150Ω. Use 220Ω for extra safety margin. Never connect an LED without a current-limiting resistor.',
    },
  },
  {
    id: 'button',
    name: 'Push Button',
    category: 'input',
    description:
      'A push button is a simple switch that connects two points in a circuit when pressed. When you release it, the connection breaks. Buttons are used to give input to a circuit — like telling your Arduino to do something.',
    specs: [
      { label: 'Type', value: 'Momentary Tactile' },
      { label: 'Rating', value: '12V / 50mA' },
      { label: 'Bounce Time', value: '< 5 ms' },
      { label: 'Lifespan', value: '100,000 presses' },
    ],
    circuitExample:
      'Connect one leg of the button to Arduino pin 2 and the other to GND. Enable the internal pull-up resistor with pinMode(2, INPUT_PULLUP). Read the button state with digitalRead(2).',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Max Voltage', value: '12 V DC' },
        { parameter: 'Max Current', value: '50 mA' },
        { parameter: 'Operating Temperature', value: '-20°C to +70°C' },
        { parameter: 'Mechanical Life', value: '100,000 cycles' },
      ],
      pinout:
        '4 pins in two pairs. Pins on the same side are always connected. Pressing the button connects the two sides. On a breadboard, place it across the center gap.',
      characteristics: [
        { parameter: 'Contact Resistance', max: '100', unit: 'mΩ' },
        { parameter: 'Bounce Time', max: '5', unit: 'ms' },
        { parameter: 'Actuation Force', typical: '160', unit: 'gf' },
        { parameter: 'Travel Distance', typical: '0.25', unit: 'mm' },
      ],
      partNumbers: ['B3F-1000', 'KSA0Axx1LFTR', 'PTS645SM43SMTR92'],
      tips: 'Switch bounce causes multiple rapid on/off signals. Use software debouncing: wait 20-50ms after a state change before reading again. Use INPUT_PULLUP mode to avoid needing an external pull-up resistor.',
    },
  },
  {
    id: 'speaker',
    name: 'Piezo Speaker',
    category: 'output',
    description:
      'A piezo speaker (buzzer) makes sound by vibrating a small disc very quickly. By changing how fast it vibrates (the frequency), you can produce different musical notes. It is great for adding audio feedback to projects.',
    specs: [
      { label: 'Voltage', value: '3 – 30 V' },
      { label: 'Frequency Range', value: '2 – 4 kHz' },
      { label: 'Sound Level', value: '~ 85 dB' },
      { label: 'Type', value: 'Passive Piezo' },
    ],
    circuitExample:
      'Connect the positive pin of the speaker to Arduino pin 8 and the negative pin to GND. Use tone(8, 440, 500) to play an A4 note (440 Hz) for half a second.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Max Input Voltage', value: '30 V peak-to-peak' },
        { parameter: 'Operating Temperature', value: '-20°C to +60°C' },
        { parameter: 'Storage Temperature', value: '-30°C to +70°C' },
      ],
      pinout:
        'Two terminals. Passive type: no polarity (either direction). Active type: marked + and −. Active buzzers make a fixed tone when powered; passive buzzers need a frequency signal.',
      characteristics: [
        { parameter: 'Resonant Frequency', min: '3.8', typical: '4.0', max: '4.2', unit: 'kHz' },
        { parameter: 'Sound Pressure Level', min: '80', typical: '85', unit: 'dB' },
        { parameter: 'Capacitance', typical: '20', unit: 'nF' },
        { parameter: 'Operating Voltage', min: '3', typical: '5', max: '30', unit: 'V' },
      ],
      partNumbers: ['PKM13EPYH4000-A0', 'PS1240P02CT3', 'ABT-402-RC'],
      tips: 'Passive piezos are more versatile — they can play melodies using the Arduino tone() function. Active buzzers only play a fixed frequency. For louder sound, drive the piezo at its resonant frequency (usually 4 kHz). Add a 100Ω resistor in series to protect Arduino pins.',
    },
  },
  {
    id: 'capacitor',
    name: 'Capacitor',
    category: 'passive',
    description:
      'A capacitor stores electrical energy temporarily, like a tiny rechargeable battery. It charges up when current flows in and releases that energy when needed. Capacitors smooth out voltage fluctuations and are essential in almost every circuit.',
    specs: [
      { label: 'Capacitance', value: '100 μF' },
      { label: 'Voltage Rating', value: '25 V' },
      { label: 'Type', value: 'Electrolytic' },
      { label: 'Tolerance', value: '± 20%' },
    ],
    circuitExample:
      'Place a 100μF capacitor across the power rails of your breadboard (positive to 5V, negative to GND). This stabilizes the voltage and protects sensitive components from power spikes.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Max DC Voltage', value: '25 V' },
        { parameter: 'Max Ripple Current (105°C)', value: '120 mA' },
        { parameter: 'Operating Temperature', value: '-40°C to +105°C' },
        { parameter: 'Surge Voltage', value: '31.25 V' },
      ],
      pinout:
        'Polarized — longer leg is positive (anode). The stripe with (−) marks on the body indicates the negative (cathode) side. NEVER reverse polarity on electrolytic capacitors.',
      characteristics: [
        { parameter: 'Capacitance', min: '80', typical: '100', max: '120', unit: 'μF' },
        { parameter: 'ESR (Equivalent Series Resistance)', max: '2.0', unit: 'Ω' },
        { parameter: 'Leakage Current', max: '25', unit: 'μA' },
        { parameter: 'Dissipation Factor', max: '0.15', unit: 'tan δ' },
      ],
      partNumbers: ['ECA-1EM101', 'UVR1E101MDD', 'ESK107M025AC3AA'],
      tips: 'Electrolytic capacitors can EXPLODE if connected backwards or overvoltaged. Always check polarity. For noise decoupling near ICs, use small ceramic capacitors (0.1μF) — they respond faster than electrolytics. The voltage rating should be at least 1.5× your working voltage.',
    },
  },
  {
    id: 'potentiometer',
    name: 'Potentiometer',
    category: 'input',
    description:
      'A potentiometer is a variable resistor with a knob you can turn. Rotating the knob changes the resistance, which lets you control things like volume, brightness, or speed. It has three pins — two outer pins and one middle wiper pin.',
    specs: [
      { label: 'Resistance Range', value: '0 – 10 kΩ' },
      { label: 'Type', value: 'Rotary (Linear Taper)' },
      { label: 'Rotation', value: '270°' },
      { label: 'Power Rating', value: '0.5 W' },
    ],
    circuitExample:
      'Connect the left pin to 5V, the right pin to GND, and the middle pin to Arduino analog pin A0. Use analogRead(A0) to read a value from 0 to 1023 as you turn the knob.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Max Power Dissipation', value: '0.5 W' },
        { parameter: 'Max Working Voltage', value: '200 V' },
        { parameter: 'Operating Temperature', value: '-10°C to +70°C' },
        { parameter: 'Rotational Life', value: '15,000 cycles' },
      ],
      pinout:
        'Pin 1 (left) and Pin 3 (right) are the fixed ends of the resistive track. Pin 2 (center) is the wiper that moves along the track. Swapping pins 1 and 3 reverses the direction.',
      characteristics: [
        { parameter: 'Total Resistance', min: '8', typical: '10', max: '12', unit: 'kΩ' },
        { parameter: 'Residual Resistance', max: '20', unit: 'Ω' },
        { parameter: 'Linearity', max: '±2', unit: '%' },
        { parameter: 'Contact Resistance Variation', max: '3', unit: '%' },
      ],
      partNumbers: ['3386P-103', 'RV09AF-20-20K', 'PTV09A-4020U-B103'],
      tips: 'Linear taper (B) pots change resistance evenly — ideal for sensor applications. Logarithmic taper (A) pots change slowly at first then quickly — ideal for audio volume control. For smoother analog readings, add a 0.1μF capacitor between the wiper pin and GND.',
    },
  },
  {
    id: 'diode',
    name: 'Diode',
    category: 'passive',
    description:
      'A diode is like a one-way valve for electricity — it only allows current to flow in one direction. The stripe on the body marks the cathode (negative) end. Diodes protect circuits from reverse voltage and are used in power supplies.',
    specs: [
      { label: 'Type', value: '1N4007 Rectifier' },
      { label: 'Max Voltage', value: '1000 V (reverse)' },
      { label: 'Max Current', value: '1 A (forward)' },
      { label: 'Forward Drop', value: '0.7 V' },
    ],
    circuitExample:
      'Place a 1N4007 reverse-biased across a DC motor: connect the stripe/cathode to the positive supply and the anode (unbanded end) to the switched side. It conducts only when motor turn-off creates an inductive voltage spike.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Peak Reverse Voltage', value: '1000 V' },
        { parameter: 'Average Forward Current', value: '1.0 A' },
        { parameter: 'Peak Surge Current', value: '30 A (8.3 ms)' },
        { parameter: 'Junction Temperature', value: '175°C' },
      ],
      pinout:
        'Anode (A) → Cathode (K). Current flows from Anode to Cathode. The stripe/band on the body marks the Cathode (negative/output side).',
      characteristics: [
        { parameter: 'Forward Voltage Drop', typical: '0.7', max: '1.1', unit: 'V' },
        { parameter: 'Reverse Leakage Current', max: '5', unit: 'μA' },
        { parameter: 'Reverse Recovery Time', typical: '30', unit: 'μs' },
        { parameter: 'Junction Capacitance', typical: '15', unit: 'pF' },
      ],
      partNumbers: ['1N4007'],
      tips: 'Use 1N4007 as a general-purpose rectifier — it handles up to 1000V reverse. For fast switching circuits (>100kHz), use 1N4148 or Schottky diodes instead (lower forward drop and faster recovery). As a flyback diode across relay/motor coils, orient the stripe toward the positive rail.',
    },
  },
  {
    id: 'transistor',
    name: 'Transistor',
    category: 'active',
    description:
      'A transistor is like an electronic switch or amplifier. A small current at the base pin controls a much larger current flowing between the collector and emitter. Transistors are the building blocks of all modern computers and electronics.',
    specs: [
      { label: 'Type', value: 'NPN (2N2222)' },
      { label: 'Max Collector Current', value: '800 mA' },
      { label: 'Max Voltage (CE)', value: '40 V' },
      { label: 'Gain (hFE)', value: '100 – 300' },
    ],
    circuitExample:
      'For a motor whose measured stall current is safely below the chosen transistor current and power limits, connect the emitter to GND, the collector to the motor, and the base through a calculated resistor to the control pin. Add a flyback diode across the motor, with its cathode/stripe toward the positive supply.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Collector-Emitter Voltage (Vce)', value: '40 V' },
        { parameter: 'Collector-Base Voltage (Vcb)', value: '75 V' },
        { parameter: 'Collector Current (Ic)', value: '800 mA' },
        { parameter: 'Total Power Dissipation', value: '500 mW' },
      ],
      pinout:
        'TO-92 package (flat side facing you, left to right): Emitter (E), Base (B), Collector (C). Pin order varies by manufacturer — always check the datasheet for your specific part.',
      characteristics: [
        { parameter: 'DC Current Gain (hFE)', min: '100', typical: '200', max: '300', unit: '' },
        { parameter: 'Base-Emitter Voltage (Vbe)', typical: '0.65', max: '0.7', unit: 'V' },
        { parameter: 'Collector-Emitter Sat. (Vce sat)', max: '0.3', unit: 'V' },
        { parameter: 'Transition Frequency (ft)', typical: '300', unit: 'MHz' },
      ],
      partNumbers: ['2N2222A', 'PN2222A'],
      tips: 'Always use a base resistor and stay within the controller pin-current limit. Do not size saturated switching from typical hFE alone; use the datasheet VCE(sat) test conditions and check transistor power dissipation. A motor can draw its full stall current at startup or when jammed, so prefer a logic-level MOSFET or motor driver rated above that current when the margin is uncertain. Inductive loads also need a correctly oriented flyback diode.',
    },
  },
  {
    id: 'servo',
    name: 'Servo Motor',
    category: 'output',
    description:
      'A servo motor is a small motor that can rotate to a specific angle and hold that position. Unlike regular motors that spin continuously, servos are precise — you tell them exactly where to point. They are used in robotics, RC cars, and automation.',
    specs: [
      { label: 'Type', value: 'SG90 Micro Servo' },
      { label: 'Rotation Range', value: '0° – 180°' },
      { label: 'Torque', value: '1.8 kg·cm' },
      { label: 'Voltage', value: '4.8 – 6.0 V' },
    ],
    circuitExample:
      'Connect the red wire to 5V, the brown wire to GND, and the orange signal wire to Arduino pin 9. Use the Servo library: myServo.attach(9) then myServo.write(90) to move to 90 degrees.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Operating Voltage', value: '4.8 – 6.0 V' },
        { parameter: 'Stall Torque (4.8V)', value: '1.8 kg·cm' },
        { parameter: 'Stall Current', value: '~650 mA' },
        { parameter: 'Operating Temperature', value: '-30°C to +60°C' },
      ],
      pinout:
        'Three wires: Brown/Black = GND, Red = VCC (4.8-6V), Orange/Yellow = Signal (PWM). Signal expects 50Hz PWM: 1ms pulse = 0°, 1.5ms = 90°, 2ms = 180°.',
      characteristics: [
        { parameter: 'PWM Frequency', typical: '50', unit: 'Hz' },
        { parameter: 'Pulse Width Range', min: '1000', typical: '1500', max: '2000', unit: 'μs' },
        { parameter: 'Operating Speed (no load)', typical: '0.12', unit: 's/60°' },
        { parameter: 'Dead Band Width', typical: '10', unit: 'μs' },
      ],
      partNumbers: ['SG90', 'SG92R', 'MG90S', 'MG996R', 'FS90'],
      tips: 'Power servos from an external 5V supply, not directly from the Arduino 5V pin — servos draw too much current and can cause resets. Use a decoupling capacitor (100μF) across the servo power pins. The Servo library disables PWM on pins 9 and 10 (Uno) — plan your pin assignments accordingly.',
    },
  },
  {
    id: 'dc-motor',
    name: 'DC Motor',
    category: 'output',
    description:
      'A DC motor converts electrical energy into continuous rotation. When you apply voltage, the shaft spins. Reverse the voltage and it spins the other way. DC motors are found in fans, toys, and electric vehicles.',
    specs: [
      { label: 'Voltage', value: '3 – 6 V' },
      { label: 'No-Load Speed', value: '~15,000 RPM' },
      { label: 'Current (no load)', value: '70 mA' },
      { label: 'Type', value: 'Brushed DC' },
    ],
    circuitExample:
      'Use a logic-level N-channel MOSFET or motor driver rated above the motor stall current. Add a flyback diode across the motor, with the cathode/stripe toward the positive motor supply and the anode toward the switched side.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Operating Voltage', value: '3 – 6 V DC' },
        { parameter: 'Stall Current', value: '800 mA' },
        { parameter: 'Max Continuous Current', value: '250 mA' },
        { parameter: 'Operating Temperature', value: '-10°C to +60°C' },
      ],
      pinout:
        'Two terminals — not polarized. Connect to positive and negative to spin one direction; swap the connections to reverse direction. No internal protection diode.',
      characteristics: [
        { parameter: 'No-Load Speed (6V)', typical: '15000', unit: 'RPM' },
        { parameter: 'No-Load Current (6V)', typical: '70', unit: 'mA' },
        { parameter: 'Stall Torque (6V)', typical: '30', unit: 'g·cm' },
        { parameter: 'Starting Voltage', min: '1.0', typical: '1.5', unit: 'V' },
      ],
      partNumbers: ['FA-130', 'RE-140RA', 'RF-300CA', 'RE-260RA'],
      tips: 'Never drive a motor directly from a microcontroller pin. Size the power supply, wiring, switch, and protection for the measured or worst-case stall current, not only the no-load current. Use a logic-level MOSFET at the actual gate voltage or a suitably rated motor driver. Add a flyback diode across a one-direction motor, cathode/stripe toward positive, and use PWM for speed control.',
    },
  },
  {
    id: 'photoresistor',
    name: 'Photoresistor (LDR)',
    category: 'input',
    description:
      'A photoresistor (Light Dependent Resistor) changes its resistance based on how much light hits it. In bright light, resistance drops low; in darkness, it rises high. It is a simple and fun way to make your project respond to light.',
    specs: [
      { label: 'Light Resistance (10 lux)', value: '3 – 20 kΩ' },
      { label: 'Dark Resistance', value: '≥ 10 MΩ' },
      { label: 'Peak Wavelength', value: '540 nm (green)' },
      { label: 'Type', value: 'CdS Photocell' },
    ],
    circuitExample:
      'Create a voltage divider: connect one leg of the LDR to 5V and the other to both a 10kΩ resistor (to GND) and Arduino analog pin A0. Use analogRead(A0) to measure light level.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Max Power Dissipation', value: '100 mW' },
        { parameter: 'Max Voltage', value: '150 V' },
        { parameter: 'Operating Temperature', value: '-30°C to +70°C' },
      ],
      pinout:
        'Two terminals — non-polarized (either direction works). The sensitive surface is the squiggly pattern on top — avoid covering it with your fingers during testing.',
      characteristics: [
        {
          parameter: 'Light Resistance (10 lux)',
          min: '3',
          max: '20',
          unit: 'kΩ',
        },
        { parameter: 'Dark Resistance', min: '10', unit: 'MΩ' },
        { parameter: 'Peak Spectral Response', typical: '540', unit: 'nm' },
        { parameter: 'Response Time (rise)', typical: '20', unit: 'ms' },
      ],
      partNumbers: ['GL5528'],
      tips: 'LDRs are slow (20ms response) — not suitable for fast light detection. For that, use a photodiode. Match the voltage divider resistor to the LDR range: use 10kΩ for general lighting, 1MΩ for very dim environments. CdS sensors contain cadmium (toxic) — RoHS-compliant alternatives exist.',
    },
  },
  {
    id: 'temp-sensor',
    name: 'Temperature Sensor',
    category: 'input',
    description:
      'A temperature sensor measures how hot or cold it is and outputs a voltage proportional to the temperature. The TMP36 is popular with Arduino because it is simple — no extra components needed. It reads from −40°C to +125°C.',
    specs: [
      { label: 'Type', value: 'TMP36 Analog' },
      { label: 'Range', value: '−40°C to +125°C' },
      { label: 'Accuracy', value: '± 2°C typical over rated range' },
      { label: 'Output Scale', value: '10 mV/°C' },
    ],
    circuitExample:
      'Connect the TO-92 supply pin to 2.7-5.5V, GND to GND, and Vout to analog input A0 after verifying the package pinout. Convert the reading with the measured ADC reference: tempC = (analogRead(A0) * measuredAref / 1024.0 - 0.5) * 100.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Operating Supply Range', value: '2.7 – 5.5 V' },
        { parameter: 'Absolute Max Supply Voltage', value: '7 V' },
        { parameter: 'Specified Temperature Range', value: '-40°C to +125°C' },
        { parameter: 'Storage Temperature', value: '-65°C to +160°C' },
      ],
      pinout:
        'TO-92 package (flat side facing you, left to right): Pin 1 = VCC (2.7-5.5V), Pin 2 = Vout (analog voltage), Pin 3 = GND. Looks like a transistor — check the markings!',
      characteristics: [
        { parameter: 'Scale Factor', typical: '10', unit: 'mV/°C' },
        { parameter: 'Output at 25°C', typical: '750', unit: 'mV' },
        {
          parameter: 'Accuracy at 25°C (F grade)',
          typical: '±1',
          max: '±2',
          unit: '°C',
        },
        {
          parameter: 'Accuracy over rated range (F grade)',
          typical: '±2',
          max: '±3',
          unit: '°C',
        },
        { parameter: 'Output Load Current', min: '0', max: '50', unit: 'μA' },
        { parameter: 'Quiescent Supply Current', max: '50', unit: 'μA' },
      ],
      partNumbers: ['TMP36GT9Z', 'TMP36GRTZ-REEL7', 'TMP36FSZ'],
      tips: 'The TMP36 output is Vout = (Temperature × 0.01) + 0.5V: 500mV at 0°C and 750mV at 25°C. ADC conversion accuracy depends on the measured ADC reference, sensor tolerance, and wiring. If using an external AREF, follow the board manufacturer procedure and voltage limits. The TMP36 resembles a transistor, so verify the part marking and package pinout.',
    },
  },
  {
    id: 'ultrasonic',
    name: 'Ultrasonic Sensor',
    category: 'input',
    description:
      'An ultrasonic sensor measures distance by sending out a sound pulse and timing how long it takes to bounce back — just like a bat. The HC-SR04 can measure from 2 cm to 4 meters. Great for obstacle detection and robotics.',
    specs: [
      { label: 'Type', value: 'HC-SR04' },
      { label: 'Range', value: '2 cm – 400 cm' },
      { label: 'Accuracy', value: '± 3 mm' },
      { label: 'Trigger Pulse', value: '10 μs' },
    ],
    circuitExample:
      'Connect VCC to 5V, GND to GND, Trig to pin 9, Echo to pin 10. Send a 10μs HIGH pulse on Trig, then use pulseIn(10, HIGH) to measure the echo time. Distance = time × 0.034 / 2 cm.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Operating Voltage', value: '5 V DC' },
        { parameter: 'Operating Current', value: '15 mA' },
        { parameter: 'Measuring Range', value: '2 – 400 cm' },
        { parameter: 'Operating Temperature', value: '-15°C to +70°C' },
      ],
      pinout:
        '4 pins (left to right): VCC (5V), Trig (trigger input), Echo (echo output), GND. Trig receives a 10μs pulse to start measurement. Echo goes HIGH for the duration of the round-trip time.',
      characteristics: [
        { parameter: 'Ultrasonic Frequency', typical: '40', unit: 'kHz' },
        { parameter: 'Measuring Angle', typical: '15', unit: '°' },
        { parameter: 'Resolution', typical: '3', unit: 'mm' },
        { parameter: 'Trigger Pulse Width', min: '10', unit: 'μs' },
      ],
      partNumbers: ['HC-SR04', 'US-015', 'HY-SRF05', 'JSN-SR04T'],
      tips: 'The echo pin outputs 5V — if using a 3.3V board (ESP32, Raspberry Pi), use a voltage divider. Soft surfaces (fabric, foam) absorb sound and give poor readings. For outdoor use, consider the JSN-SR04T (waterproof). Minimum measurement interval is ~60ms for reliable readings. Speed of sound varies with temperature: use 331.3 + (0.606 × tempC) m/s for precision.',
    },
  },
  {
    id: 'lcd',
    name: 'LCD Display',
    category: 'output',
    description:
      'An LCD display shows text and numbers on a small screen. The 16×2 LCD has two rows of 16 characters each. It is the easiest way to show sensor readings, messages, or menus without needing a computer screen.',
    specs: [
      { label: 'Type', value: '16×2 Character LCD' },
      { label: 'Controller', value: 'HD44780' },
      { label: 'Backlight', value: 'LED (blue or green)' },
      { label: 'Voltage', value: '5 V' },
    ],
    circuitExample:
      'Wire RS to pin 12, Enable to pin 11, D4-D7 to pins 5-2. Include a 10kΩ potentiometer on the contrast pin (V0). Use LiquidCrystal library: lcd.begin(16, 2) then lcd.print("Hello!").',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Supply Voltage (VDD)', value: '5 V' },
        { parameter: 'Backlight Current', value: '120 mA max' },
        { parameter: 'Operating Temperature', value: '0°C to +50°C' },
        { parameter: 'Storage Temperature', value: '-10°C to +60°C' },
      ],
      pinout:
        '16 pins: VSS(GND), VDD(5V), V0(contrast), RS(register select), RW(read/write), E(enable), D0-D7(data), A(backlight+), K(backlight−). In 4-bit mode, only D4-D7 are used, saving 4 Arduino pins.',
      characteristics: [
        { parameter: 'Character Matrix', typical: '5×8', unit: 'dots' },
        { parameter: 'Display Characters', typical: '32', unit: '(16×2)' },
        { parameter: 'Contrast Voltage (V0)', min: '0', max: '5', unit: 'V' },
        { parameter: 'Backlight Forward Voltage', typical: '4.2', unit: 'V' },
      ],
      partNumbers: ['LCD1602A', 'JHD162A', 'WH1602A', 'TC1602A'],
      tips: 'Get an I2C backpack module (PCF8574) to reduce wiring from 12 wires to just 4 (VCC, GND, SDA, SCL). If the display shows only boxes, adjust the contrast potentiometer. You can create up to 8 custom characters using lcd.createChar(). For projects needing graphics, consider an OLED display (SSD1306) instead.',
    },
  },
  {
    id: 'relay',
    name: 'Relay',
    category: 'active',
    description:
      'A relay is an electrically controlled switch. A bare relay has only a coil and contacts; it is not a ready-to-use microcontroller relay module, and its contact rating alone does not make mains wiring safe.',
    specs: [
      { label: 'Coil Voltage', value: '5 V DC (example part)' },
      { label: 'Published Contact Rating', value: 'Part- and load-specific' },
      { label: 'Coil Current', value: '~ 72–90 mA; requires a driver' },
      { label: 'Type', value: 'SPDT PCB relay or relay module' },
    ],
    circuitExample:
      'For an extra-low-voltage DC load only, use a relay module whose input and supply requirements match the controller, then verify whether its input is active-high or active-low. Do not use a solderless breadboard for mains wiring.',
    datasheetInfo: {
      maxRatings: [
        {
          parameter: 'Published AC Contact Rating (relay only)',
          value: 'Verify exact part and load',
        },
        {
          parameter: 'Published DC Contact Rating (relay only)',
          value: 'Verify exact part and load',
        },
        { parameter: 'Coil Voltage', value: '5 V DC' },
        { parameter: 'Mechanical Life', value: '10,000,000 operations' },
      ],
      pinout:
        'A bare relay typically exposes two coil pins plus COM, NO, and NC contacts; it needs an external driver and flyback diode. A relay module may instead expose VCC, GND, and IN and may include a driver, diode, indicator, or optocoupler. Verify the exact board schematic and pin labels.',
      characteristics: [
        { parameter: 'Coil Current', typical: '70', unit: 'mA' },
        { parameter: 'Contact Resistance', max: '100', unit: 'mΩ' },
        { parameter: 'Operate Time', max: '10', unit: 'ms' },
        { parameter: 'Release Time', max: '5', unit: 'ms' },
      ],
      partNumbers: ['SRD-05VDC-SL-C', 'JQC-3FF-S-Z', 'HK4100F-DC5V-SHG'],
      tips: 'Never drive a bare relay coil directly from a microcontroller pin. A relay or optocoupler does not by itself make exposed mains wiring safe. Do not switch or breadboard mains unless the complete design uses appropriately certified components, fusing, clearances, strain relief, earthing, and a closed enclosure; have mains work designed or checked by a licensed electrician. Contact ratings depend on the exact load type and do not automatically transfer to a relay module or PCB.',
    },
  },
  {
    id: 'rgb-led',
    name: 'RGB LED',
    category: 'output',
    description:
      'An RGB LED is actually three tiny LEDs (red, green, blue) in one package. By mixing different brightness levels of each color, you can create virtually any color. It has four legs — one common pin and one for each color.',
    specs: [
      { label: 'Type', value: '5mm Common Cathode' },
      { label: 'Red Forward Voltage', value: '2.0 V' },
      { label: 'Green Forward Voltage', value: '3.2 V' },
      { label: 'Blue Forward Voltage', value: '3.2 V' },
    ],
    circuitExample:
      'Connect the longest leg (cathode) to GND. Connect R, G, B legs through 220Ω resistors to Arduino pins 9, 10, 11. Use analogWrite(9, 255) for red, analogWrite(10, 255) for green, etc.',
    datasheetInfo: {
      maxRatings: [
        { parameter: 'Max Current (per channel)', value: '20 mA' },
        { parameter: 'Red Reverse Voltage', value: '5 V' },
        { parameter: 'Green/Blue Reverse Voltage', value: '5 V' },
        { parameter: 'Total Power Dissipation', value: '210 mW' },
      ],
      pinout:
        'Common Cathode (4 pins, longest = cathode/GND): Red, Cathode(−), Green, Blue. Common Anode (longest = anode/VCC): Red, Anode(+), Green, Blue. Pin order varies — test each leg with a resistor and 5V.',
      characteristics: [
        { parameter: 'Red Forward Voltage', min: '1.8', typical: '2.0', max: '2.2', unit: 'V' },
        { parameter: 'Green Forward Voltage', min: '3.0', typical: '3.2', max: '3.4', unit: 'V' },
        { parameter: 'Blue Forward Voltage', min: '3.0', typical: '3.2', max: '3.4', unit: 'V' },
        { parameter: 'Viewing Angle', typical: '25', unit: '°' },
      ],
      partNumbers: ['LEDRGB-CC-5MM', 'YSL-R596CR3G4B5C-C10', 'COM-00105'],
      tips: 'Each color needs its own resistor calculated from R = (Vsupply - Vf) / current. At 5V and a 20mA maximum, a 3.2V green or blue channel needs at least 100Ω (90Ω calculated, rounded up); 220Ω on every channel is a safe, lower-current starting point. Tune brightness with PWM rather than undersizing resistors. For common anode, use analogWrite(pin, 255 - value) to invert the logic.',
    },
  },
];

// Search functions
export function lookupComponent(query: string): ElectronicsComponent | null {
  const q = query.toLowerCase().trim();

  // Exact id match
  const exactId = electronicsComponents.find((c) => c.id === q);
  if (exactId) return exactId;

  // Exact name match (case-insensitive)
  const exactName = electronicsComponents.find((c) => c.name.toLowerCase() === q);
  if (exactName) return exactName;

  // Partial name match
  const partialName = electronicsComponents.find(
    (c) => c.name.toLowerCase().includes(q) || c.id.includes(q) || q.includes(c.id)
  );
  if (partialName) return partialName;

  // Fuzzy: check if query words appear in description
  const words = q.split(/\s+/);
  const fuzzy = electronicsComponents.find((c) => {
    const text = `${c.name} ${c.description}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  return fuzzy ?? null;
}

export function searchComponents(options: {
  category?: string;
  keyword?: string;
}): ElectronicsComponent[] {
  let results = [...electronicsComponents];

  if (options.category) {
    const cat = options.category.toLowerCase();
    results = results.filter((c) => c.category === cat);
  }

  if (options.keyword) {
    const kw = options.keyword.toLowerCase();
    results = results.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        c.description.toLowerCase().includes(kw) ||
        c.id.includes(kw)
    );
  }

  return results;
}
