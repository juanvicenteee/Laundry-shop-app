// Mirrors customer-v2.6.8.js's SERVICE_GEOFENCES / detectServiceArea exactly, so a
// GPS-detected area matches what the backend would derive from the same coordinates.

export const SERVICE_GEOFENCES = {
  mplace: { lat: 14.6389788, lng: 121.033465, radiusM: 500 },
  cubao: { lat: 14.6175619, lng: 121.0598714, radiusM: 3500 }
} as const;

export const SHOP_ADDRESS = "92 14th Ave, Cubao, Quezon City, Philippines, 1109";
export const LALAMOVE_WEB_URL = "https://web.lalamove.com/";

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

export function detectServiceArea(lat: number, lng: number): "cubao" | "mplace" | "outside" {
  const { mplace, cubao } = SERVICE_GEOFENCES;
  if (distanceMeters(lat, lng, mplace.lat, mplace.lng) <= mplace.radiusM) return "mplace";
  if (distanceMeters(lat, lng, cubao.lat, cubao.lng) <= cubao.radiusM) return "cubao";
  return "outside";
}
