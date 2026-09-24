// Shared tuning constants.
export const LAPS = 3;
export const MAX_HUMANS = 4;
export const TOTAL_KARTS = 8;

export const ROAD_W = 16, HALF_W = ROAD_W / 2, CURB_W = 1.4, SHOULDER = 5;
export const BARRIER = HALF_W + CURB_W + SHOULDER; // wall line, from the centerline
export const WALL = BARRIER - 1.1;                  // closest a kart's center can get to it

export const MAX_SPEED = 34, OFFROAD_MAX = 15, BOOST_SPEED = 48, BULLET_SPEED = 58;
export const ACCEL = 19, BRAKE = 40, REVERSE_MAX = 10, TURN = 2.4;

export const SIM_HZ = 60, STEP = 1 / SIM_HZ; // fixed simulation tick; recorded data and policies use this rate

export const HUMAN_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835];
export const CPU_COLORS = [0x8e24aa, 0xfb8c00, 0x00acc1, 0xec407a, 0x795548, 0xf5f5f5, 0x3949ab, 0x9e9d24];
export const CPU_NAMES = ['Bowzo', 'Toadie', 'Yoshimi', 'Peachy', 'Luigo', 'Wally', 'Dizzy', 'Koopz'];

export const ITEM_KEYS = ['mushroom', 'banana', 'shell', 'blueshell', 'bullet'];
export const NO_INPUT = { steer: 0, gas: 0, brake: 0, drift: 0, item: 0 };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
export const rand = (a, b) => a + Math.random() * (b - a);
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const hexStr = (c) => '#' + c.toString(16).padStart(6, '0');
