/**
 * The device presets for the viewport emulator, in CSS pixels, matching what
 * Chrome DevTools ships so numbers line up with what everyone already tests
 * against. Grouped for the picker; "Responsive" (free W x H) is the null case.
 */

export type Device = { label: string; w: number; h: number; group: "phone" | "tablet" | "laptop" };

export const DEVICES: Device[] = [
  { label: "iPhone SE", w: 375, h: 667, group: "phone" },
  { label: "iPhone 14", w: 390, h: 844, group: "phone" },
  { label: "iPhone 15 Pro", w: 393, h: 852, group: "phone" },
  { label: "iPhone 15 Pro Max", w: 430, h: 932, group: "phone" },
  { label: "Galaxy S8+", w: 360, h: 740, group: "phone" },
  { label: "Pixel 7", w: 412, h: 915, group: "phone" },
  { label: "iPad Mini", w: 768, h: 1024, group: "tablet" },
  { label: "iPad Pro 11", w: 834, h: 1194, group: "tablet" },
  { label: "iPad Pro 12.9", w: 1024, h: 1366, group: "tablet" },
  { label: "MacBook Air 13", w: 1280, h: 832, group: "laptop" },
  { label: "MacBook Air 15", w: 1440, h: 900, group: "laptop" },
  { label: "MacBook Pro 14", w: 1512, h: 982, group: "laptop" },
  { label: "MacBook Pro 16", w: 1728, h: 1117, group: "laptop" },
  { label: "Full HD", w: 1920, h: 1080, group: "laptop" },
  { label: "QHD monitor", w: 2560, h: 1440, group: "laptop" },
];
