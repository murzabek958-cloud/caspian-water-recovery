export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const LOCATIONS = [
    { city: 'Ақтау',         lat: 43.65, lon: 51.17 },
    { city: 'Атырау',        lat: 47.10, lon: 51.91 },
    { city: 'Форт-Шевченко', lat: 44.51, lon: 50.27 },
    { city: 'Қаражанбас',    lat: 45.42, lon: 52.68 },
    { city: 'Маңғыстау',     lat: 43.74, lon: 51.48 },
  ];

  const KEY = process.env.OWM_KEY;

  function dewPoint(temp, humidity) {
    return +(temp - ((100 - humidity) / 5)).toFixed(1);
  }

  function condensationIndex(temp, humidity, wind) {
    const h = humidity;
    const t = Math.max(0, (45 - temp) / 45 * 100);
    const w = Math.min(wind * 5, 100);
    return +(h * 0.5 + t * 0.3 + w * 0.2).toFixed(1);
  }

  function bestTech(temp, humidity, wind) {
    const dp = dewPoint(temp, humidity);
    if (temp - dp < 5) return 'Радиациялық салқындату';
    if (humidity > 70)  return 'Fog collector торлары';
    if (wind > 5)       return 'Ылғалды ауа ағыны';
    return 'Ультрадыбыстық ионизатор';
  }

  try {
    const results = await Promise.all(
      LOCATIONS.map(async (loc) => {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${loc.lat}&lon=${loc.lon}&appid=${KEY}&units=metric`;
        const r = await fetch(url);
        const d = await r.json();

        const temp     = +d.main.temp.toFixed(1);
        const humidity = d.main.humidity;
        const wind     = +d.wind.speed.toFixed(1);
        const index    = condensationIndex(temp, humidity, wind);

        return {
          city:  loc.city,
          lat:   loc.lat,
          lon:   loc.lon,
          temp,
          humidity,
          wind,
          dew:   dewPoint(temp, humidity),
          index,
          tech:  bestTech(temp, humidity, wind),
        };
      })
    );
    res.status(200).json({ ok: true, data: results, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
