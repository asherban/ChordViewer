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

const STORAGE_KEY = 'cv_chart';
const DEFAULT_BAR_COUNT = 8;

export function emptyChart(): LeadSheet {
  return {
    meta: { title: '', key: '', time: '4/4', tempo: '120' },
    bars: Array.from({ length: DEFAULT_BAR_COUNT }, () => [null, null, null, null]),
  };
}

export function loadChart(): LeadSheet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyChart();
    return JSON.parse(raw) as LeadSheet;
  } catch {
    return emptyChart();
  }
}

export function saveChart(chart: LeadSheet): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chart));
}
