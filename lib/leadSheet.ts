export interface Meta {
  title: string;
  key: string;
  time: string;
  tempo: string;
}

export interface LeadSheet {
  meta: Meta;
  bars: (string | null)[][];
}

const DEFAULT_BAR_COUNT = 8;

export function emptyChart(): LeadSheet {
  return {
    meta: { title: '', key: '', time: '4/4', tempo: '120' },
    bars: Array.from({ length: DEFAULT_BAR_COUNT }, () => [null, null, null, null]),
  };
}
