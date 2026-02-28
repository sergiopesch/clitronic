import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { lookupComponent, searchComponents } from '@/lib/data/search';

export const electronicsTools = {
  lookup_component: tool({
    description:
      'Look up detailed specifications, pinout, datasheet info, and tips for a specific electronic component. Use this when the user asks about a particular component by name.',
    inputSchema: zodSchema(
      z.object({
        query: z
          .string()
          .describe(
            "The component name or id to look up (e.g. 'resistor', 'led', 'capacitor', 'transistor')"
          ),
      })
    ),
    execute: async ({ query }) => {
      const component = lookupComponent(query);
      if (!component) {
        return {
          found: false as const,
          message: `No component found matching "${query}". Available components: resistor, led, button, speaker, capacitor, potentiometer, diode, transistor, servo, dc-motor, photoresistor, temp-sensor, ultrasonic, lcd, relay, rgb-led.`,
        };
      }
      return {
        found: true as const,
        component,
      };
    },
  }),

  search_components: tool({
    description:
      'Search the component knowledge base by category or keyword. Use this to list components or find components matching criteria.',
    inputSchema: zodSchema(
      z.object({
        category: z
          .enum(['passive', 'active', 'input', 'output'])
          .optional()
          .describe('Filter by component category'),
        keyword: z
          .string()
          .optional()
          .describe('Keyword to search in component names and descriptions'),
      })
    ),
    execute: async ({ category, keyword }) => {
      const results = searchComponents({ category, keyword });
      return {
        count: results.length,
        components: results.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          description: c.description,
        })),
      };
    },
  }),

  calculate_resistor: tool({
    description:
      'Calculate the correct resistor value for common scenarios: LED current limiting, voltage dividers, or pull-up/pull-down resistors.',
    inputSchema: zodSchema(
      z.object({
        scenario: z
          .enum(['led', 'voltage_divider', 'pullup'])
          .describe('The type of resistor calculation'),
        supply_voltage: z.number().describe('Supply voltage in volts'),
        forward_voltage: z
          .number()
          .optional()
          .describe('LED forward voltage in volts (for LED scenario)'),
        desired_current_ma: z
          .number()
          .optional()
          .describe('Desired current in milliamps (for LED scenario)'),
        output_voltage: z
          .number()
          .optional()
          .describe('Desired output voltage (for voltage divider)'),
        r1_ohms: z
          .number()
          .optional()
          .describe(
            'Known resistor value in ohms (for voltage divider, provide R1 to calculate R2)'
          ),
      })
    ),
    execute: async ({
      scenario,
      supply_voltage,
      forward_voltage,
      desired_current_ma,
      output_voltage,
      r1_ohms,
    }) => {
      if (scenario === 'led') {
        const vf = forward_voltage ?? 2.0;
        const current = (desired_current_ma ?? 20) / 1000;
        const resistance = (supply_voltage - vf) / current;
        const standardValues = [
          10, 22, 47, 100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700,
        ];
        const nearest = standardValues.reduce((prev, curr) =>
          Math.abs(curr - resistance) < Math.abs(prev - resistance) ? curr : prev
        );
        return {
          scenario: 'LED current limiting',
          formula: 'R = (Vsupply - Vled) / I',
          calculation: `R = (${supply_voltage} - ${vf}) / ${current} = ${resistance.toFixed(1)} Ω`,
          exact_value: `${resistance.toFixed(1)} Ω`,
          nearest_standard: `${nearest} Ω`,
          power_dissipated: `${(current * current * nearest * 1000).toFixed(1)} mW`,
        };
      }

      if (scenario === 'voltage_divider') {
        const vout = output_voltage ?? supply_voltage / 2;
        if (r1_ohms) {
          const r2 = (r1_ohms * vout) / (supply_voltage - vout);
          return {
            scenario: 'Voltage divider',
            formula: 'Vout = Vin × R2 / (R1 + R2)',
            calculation: `R2 = R1 × Vout / (Vin - Vout) = ${r1_ohms} × ${vout} / (${supply_voltage} - ${vout}) = ${r2.toFixed(1)} Ω`,
            r1: `${r1_ohms} Ω`,
            r2: `${r2.toFixed(1)} Ω`,
            output_voltage: `${vout} V`,
          };
        }
        return {
          scenario: 'Voltage divider',
          formula: 'Vout = Vin × R2 / (R1 + R2)',
          suggestion: `For ${supply_voltage}V to ${vout}V: use R1=10kΩ, R2=${((10000 * vout) / (supply_voltage - vout)).toFixed(0)} Ω`,
        };
      }

      return {
        scenario: 'Pull-up resistor',
        recommendation: `For ${supply_voltage}V logic: use 4.7kΩ to 10kΩ. Smaller values = stronger pull-up (faster rise time, more current). Larger values = weaker pull-up (less current, slower). Arduino has built-in ~20kΩ pull-ups via INPUT_PULLUP.`,
      };
    },
  }),

  ohms_law: tool({
    description:
      "Calculate voltage, current, resistance, or power using Ohm's law. Provide any two of the three values (V, I, R) to calculate the third, plus power.",
    inputSchema: zodSchema(
      z.object({
        voltage: z.number().optional().describe('Voltage in volts'),
        current_ma: z.number().optional().describe('Current in milliamps'),
        resistance: z.number().optional().describe('Resistance in ohms'),
      })
    ),
    execute: async ({ voltage, current_ma, resistance }) => {
      const i = current_ma ? current_ma / 1000 : undefined;

      if (voltage !== undefined && i !== undefined) {
        const r = voltage / i;
        const p = voltage * i;
        return {
          voltage: `${voltage} V`,
          current: `${current_ma} mA`,
          resistance: `${r.toFixed(1)} Ω`,
          power: `${(p * 1000).toFixed(1)} mW`,
          formula_used: 'R = V / I',
        };
      }
      if (voltage !== undefined && resistance !== undefined) {
        const calcI = voltage / resistance;
        const p = voltage * calcI;
        return {
          voltage: `${voltage} V`,
          current: `${(calcI * 1000).toFixed(2)} mA`,
          resistance: `${resistance} Ω`,
          power: `${(p * 1000).toFixed(1)} mW`,
          formula_used: 'I = V / R',
        };
      }
      if (i !== undefined && resistance !== undefined) {
        const v = i * resistance;
        const p = v * i;
        return {
          voltage: `${v.toFixed(2)} V`,
          current: `${current_ma} mA`,
          resistance: `${resistance} Ω`,
          power: `${(p * 1000).toFixed(1)} mW`,
          formula_used: 'V = I × R',
        };
      }
      return {
        error: 'Please provide at least two of: voltage, current_ma, resistance',
      };
    },
  }),
};
