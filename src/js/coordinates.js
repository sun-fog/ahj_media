export default function parseCoordinates(input) {
  let cleaned = String(input).replace(/−/g, '-').trim();

  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  const parts = cleaned.split(',');
  if (parts.length !== 2) {
    throw new Error('Неверный формат координат');
  }

  const numberRe = /^-?\d+(?:\.\d+)?$/;
  const lat = parts[0].trim();
  const lon = parts[1].trim();

  if (!numberRe.test(lat) || !numberRe.test(lon)) {
    throw new Error('Неверный формат координат');
  }

  return {
    latitude: Number(lat),
    longitude: Number(lon),
  };
}
