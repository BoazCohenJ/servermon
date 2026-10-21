export type Level = 'ok' | 'warn' | 'crit';

export interface SystemStats {
  status: Level;
  cpu_pct: number;
  cores: number;
  load: [number, number, number];
  mem_total: number;
  mem_used: number;
  mem_pct: number;
  swap_total: number;
  swap_used: number;
  uptime_s: number;
  net_rx_rate: number | null;
  net_tx_rate: number | null;
}

export interface Filesystem {
  mount: string;
  device: string;
  fstype: string;
  total: number;
  used: number;
  pct: number;
  status: Level;
}

export interface Disk {
  id: string;
  device: string;
  model: string;
  serial: string | null;
  type: 'hdd' | 'ssd' | 'nvme';
  capacity: number | null;
  passed: boolean | null;
  temp_c: number | null;
  power_on_hours: number | null;
  realloc: number;
  pending: number;
  offline_uncorrect: number;
  crc_errors: number;
  wear_pct: number | null;
  media_errors: number | null;
  spare_pct: number | null;
  status: Level;
  reasons: string[];
}

export interface Service {
  name: string;
  kind: 'systemd' | 'docker';
  state: string;
  detail?: string;
  image?: string;
  status: Level;
}

export interface Snapshot {
  hostname: string;
  collected_at: number;
  server_time: number;
  stale: boolean;
  overall: Level;
  warnings: string[];
  system: SystemStats;
  filesystems: Filesystem[];
  disks: Disk[];
  services: Service[];
}

export interface HistoryPoint {
  t: number;
  realloc: number;
  pending: number;
  temp_c: number | null;
  power_on_hours: number | null;
  wear_pct?: number | null;
}

export type History = Record<string, HistoryPoint[]>;
