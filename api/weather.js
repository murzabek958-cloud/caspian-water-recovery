// api/weather.js
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 минут cache

  try {
    // caspian_sea_grid.json файлын оқу
    const gridPath = path.join(process.cwd(), 'caspian_sea_grid.json');
    const gridData = JSON.parse(fs.readFileSync(gridPath, 'utf8'));

    // Кілттердегі бос орындарды тазалау
    const clean = (obj) => Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.trim(), v])
    );
    const cleanedGrid = gridData.map(clean);

    // OpenWeatherMap API кілті
    const OWM_KEY = process.env.OWM_KEY;
    
    if (!OWM_KEY) {
      // Егер API кілті жоқ болса, деректерді қайтарамыз (булану индексін есептейміз)
      const features = cleanedGrid.map(point => {
        const evaporation = calculateEvaporation(point.temp, point.humidity, point.wind, point.sst);
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [point.lon, point.lat]
          },
          properties: {
            lat: point.lat,
            lon: point.lon,
            temp: point.temp,
            humidity: point.humidity,
            wind: point.wind,
            sst: point.sst,
            evaporation: evaporation,
            timestamp: new Date().toISOString()
          }
        };
      });

      return res.status(200).json({
        type: 'FeatureCollection',
        features: features,
        metadata: {
          totalPoints: features.length,
          timestamp: new Date().toISOString(),
          source: 'caspian_sea_grid.json'
        }
      });
    }

    // Егер API кілті бар болса, OpenWeatherMap-тен деректер аламыз
    const weatherPromises = cleanedGrid.map(async (point) => {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${point.lat}&lon=${point.lon}&appid=${OWM_KEY}&units=metric`;
        const response = await fetch(url);
        const data = await response.json();
        
        return {
          ...point,
          apiTemp: data.main?.temp || point.temp,
          apiHumidity: data.main?.humidity || point.humidity,
          apiWind: data.wind?.speed || point.wind
        };
      } catch (e) {
        return point;
      }
    });

    const weatherData = await Promise.all(weatherPromises);

    // GeoJSON форматында қайтару
    const features = weatherData.map(point => {
      const evaporation = calculateEvaporation(
        point.apiTemp || point.temp,
        point.apiHumidity || point.humidity,
        point.apiWind || point.wind,
        point.sst
      );

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [point.lon, point.lat]
        },
        properties: {
          lat: point.lat,
          lon: point.lon,
          temp: point.apiTemp || point.temp,
          humidity: point.apiHumidity || point.humidity,
          wind: point.apiWind || point.wind,
          sst: point.sst,
          evaporation: evaporation,
          timestamp: new Date().toISOString()
        }
      };
    });

    res.status(200).json({
      type: 'FeatureCollection',
      features: features,
      metadata: {
        totalPoints: features.length,
        timestamp: new Date().toISOString(),
        source: 'OpenWeatherMap API'
      }
    });

  } catch (error) {
    console.error('Weather API Error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Булану индексін есептеу формуласы
function calculateEvaporation(temp, humidity, wind, sst) {
  // Пенман формуласының жеңілдетілген нұсқасы
  const tempDiff = sst - temp; // Су мен ауа температурасының айырмашылығы
  const humidityFactor = (100 - humidity) / 100; // Ылғалдылық тапшылығы
  const windFactor = 1 + (wind * 0.1); // Жел әсері
  
  // Негізгі булану есептеуі
  let evaporation = (tempDiff * 0.5 + temp * 0.3) * humidityFactor * windFactor;
  
  // Шектеулер
  evaporation = Math.max(0, Math.min(evaporation, 20)); // 0-20 мм/күн аралығы
  
  return +evaporation.toFixed(2);
}
