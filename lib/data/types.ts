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
