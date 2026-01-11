// ---------------------------------------------------------
// 1. 設定與輔助函式
// ---------------------------------------------------------

// WMO 天氣代碼轉換表
function getWeatherStatus(code) {
    const map = {
        0: { desc: "晴朗", icon: "☀️", category: "sunny" },
        1: { desc: "晴時多雲", icon: "🌤️", category: "sunny" },
        2: { desc: "多雲", icon: "⛅", category: "cloudy" },
        3: { desc: "陰天", icon: "☁️", category: "cloudy" },
        45: { desc: "霧", icon: "🌫️", category: "cloudy" },
        48: { desc: "霧凇", icon: "🌫️", category: "cloudy" },
        51: { desc: "小雨", icon: "🌧️", category: "rain" },
        53: { desc: "中雨", icon: "🌧️", category: "rain" },
        55: { desc: "大雨", icon: "🌧️", category: "rain" },
        61: { desc: "小雨", icon: "☔", category: "rain" },
        63: { desc: "中雨", icon: "☔", category: "rain" },
        65: { desc: "大雨", icon: "☔", category: "rain" },
        71: { desc: "小雪", icon: "🌨️", category: "rain" },
        73: { desc: "中雪", icon: "🌨️", category: "rain" },
        75: { desc: "大雪", icon: "🌨️", category: "rain" },
        80: { desc: "陣雨", icon: "🌦️", category: "rain" },
        81: { desc: "陣雨", icon: "🌦️", category: "rain" },
        82: { desc: "強陣雨", icon: "⛈️", category: "rain" },
        95: { desc: "雷雨", icon: "⚡", category: "rain" },
        96: { desc: "雷陣雨", icon: "⛈️", category: "rain" },
        99: { desc: "強雷陣雨", icon: "⛈️", category: "rain" }
    };
    return map[code] || { desc: "未知", icon: "❓", category: "cloudy" };
}

// 取得星期幾
function getDayName(dateStr) {
    const date = new Date(dateStr);
    const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    return days[date.getDay()];
}

// 格式化時間 (HH:MM)
function formatTime(isoString) {
    if (!isoString) return "--:--";
    const date = new Date(isoString);
    return date.getHours().toString().padStart(2, '0') + ':' + 
           date.getMinutes().toString().padStart(2, '0');
}

// 風向角度轉文字
function getWindDirection(deg) {
    const directions = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
    // 將 360 度切成 8 等份，每份 45 度
    const index = Math.round(deg / 45) % 8;
    return directions[index];
}

// 能見度描述
function getVisibilityDesc(km) {
    if (km >= 20) return "極佳";
    if (km >= 10) return "良好";
    if (km >= 5) return "普通";
    if (km >= 2) return "差";
    return "極差";
}

// 紫外線描述
function getUVDesc(uv) {
    if (uv <= 2) return "低";
    if (uv <= 5) return "中";
    if (uv <= 7) return "高";
    if (uv <= 10) return "甚高";
    return "危險";
}

// 月相計算演算法 (簡易版農曆計算)
function getMoonPhase(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    let c = 0, e = 0, j = 0;
    let y = year, m = month;
    
    if (m < 3) {
        y--;
        m += 12;
    }
    ++m;
    c = 365.25 * y;
    e = 30.6 * m;
    j = c + e + day - 694039.09; // Julian Date offset
    j /= 29.5305882; // Lunar cycle length
    let b = parseInt(j);
    j -= b; // 取得小數部分
    b = Math.round(j * 8); // 分割成 8 個階段

    if (b >= 8) b = 0;

    const phases = {
        0: { name: "新月", icon: "🌑" },
        1: { name: "眉月", icon: "🌒" },
        2: { name: "上弦月", icon: "🌓" },
        3: { name: "盈凸月", icon: "🌔" },
        4: { name: "滿月", icon: "🌕" },
        5: { name: "虧凸月", icon: "🌖" },
        6: { name: "下弦月", icon: "🌗" },
        7: { name: "殘月", icon: "🌘" }
    };
    
    // 計算照度 (0-100%)
    const illumination = Math.round((1 - Math.cos(j * 2 * Math.PI)) / 2 * 100);
    
    return { ...phases[b], illumination };
}

// ---------------------------------------------------------
// 2. 初始化與 API 請求
// ---------------------------------------------------------

async function initWeather() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                document.querySelector('.location').textContent = "本地天氣";
                await fetchWeatherData(lat, lon);
            },
            (error) => {
                // 如果拒絕定位，預設顯示台北
                console.warn("定位失敗或被拒絕，使用預設地點");
                fetchWeatherData(25.0330, 121.5654); 
                document.querySelector('.location').textContent = "臺北市 (預設)";
            }
        );
    } else {
        alert("您的瀏覽器不支援定位功能");
        fetchWeatherData(25.0330, 121.5654);
    }
}

async function fetchWeatherData(lat, lon) {
    // 構建 Open-Meteo API URL (包含所有需要的參數)
    const params = [
        "latitude=" + lat,
        "longitude=" + lon,
        "current=temperature_2m,weather_code,is_day,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation,visibility",
        "hourly=temperature_2m,weather_code",
        "daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,precipitation_sum",
        "timezone=auto"
    ];
    const url = `https://api.open-meteo.com/v1/forecast?${params.join("&")}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Weather data fetch failed");
        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error("Error fetching weather:", error);
        document.querySelector('.condition').textContent = "資料載入失敗";
    }
}

// ---------------------------------------------------------
// 3. UI 更新邏輯
// ---------------------------------------------------------

function setDynamicBackground(weatherCode, isDay) {
    const body = document.body;
    const status = getWeatherStatus(weatherCode);
    
    // 移除舊的 class
    body.classList.remove('theme-loading', 'theme-sunny', 'theme-cloudy', 'theme-rain', 'theme-night');

    if (isDay === 0) {
        body.classList.add('theme-night'); // 晚上
    } else {
        // 白天根據天氣狀況
        if (status.category === 'sunny') body.classList.add('theme-sunny');
        else if (status.category === 'cloudy') body.classList.add('theme-cloudy');
        else if (status.category === 'rain') body.classList.add('theme-rain');
        else body.classList.add('theme-cloudy');
    }
}

function updateUI(data) {
    const current = data.current;
    const hourly = data.hourly;
    const daily = data.daily;
    const weatherStatus = getWeatherStatus(current.weather_code);

    // --- A. 更新 Header 與背景 ---
    setDynamicBackground(current.weather_code, current.is_day);
    document.querySelector('.temp').textContent = Math.round(current.temperature_2m) + "°";
    document.querySelector('.condition').textContent = weatherStatus.desc;
    document.querySelector('#max-temp').textContent = Math.round(daily.temperature_2m_max[0]);
    document.querySelector('#min-temp').textContent = Math.round(daily.temperature_2m_min[0]);

    // --- B. 更新詳細資訊 Grid ---
    
    // 1. 體感
    document.getElementById('feels-like').textContent = Math.round(current.apparent_temperature) + "°";
    
    // 2. 紫外線
    const uvMax = daily.uv_index_max[0];
    document.getElementById('uv-index').textContent = Math.round(uvMax);
    document.getElementById('uv-desc').textContent = getUVDesc(uvMax);

    // 3. 風速與風向
    document.getElementById('wind-speed').textContent = Math.round(current.wind_speed_10m);
    document.getElementById('wind-dir').textContent = getWindDirection(current.wind_direction_10m);
    // 旋轉箭頭 (假設箭頭圖示預設向上，若預設向右需自行調整 css transform)
    const windDeg = current.wind_direction_10m;
    document.getElementById('wind-arrow').style.transform = `rotate(${windDeg}deg)`;

    // 4. 日出日落
    const sunriseStr = formatTime(daily.sunrise[0]);
    const sunsetStr = formatTime(daily.sunset[0]);
    document.getElementById('sunrise-time').textContent = sunriseStr;
    document.getElementById('sunset-preview').textContent = sunsetStr;
    document.getElementById('sunset-time').textContent = sunsetStr;
    document.getElementById('sunrise-preview').textContent = sunriseStr;

    // 5. 降水量
    document.getElementById('precip').textContent = daily.precipitation_sum[0];

    // 6. 能見度 (API 回傳公尺，轉為公里)
    const visKm = (current.visibility / 1000).toFixed(1);
    document.getElementById('visibility').textContent = visKm;
    document.getElementById('vis-desc').textContent = getVisibilityDesc(visKm);

    // 7. 月相
    const moonData = getMoonPhase(new Date());
    document.getElementById('moon-phase').textContent = moonData.name;
    document.getElementById('moon-illumination').textContent = moonData.illumination + "%";
    document.getElementById('moon-icon').textContent = moonData.icon;

    // --- C. 更新列表 (Hourly & Daily) ---
    updateForecastLists(hourly, daily, current.temperature_2m);
}

function updateForecastLists(hourly, daily, currentTemp) {
    // 1. 小時預報 (Hourly)
    const hourlyContainer = document.getElementById('hourly-container');
    hourlyContainer.innerHTML = ''; 
    
    const now = new Date();
    const currentHour = now.getHours();
    
    // 找到目前的索引位置
    let startIndex = hourly.time.findIndex(t => new Date(t).getHours() === currentHour);
    if (startIndex === -1) startIndex = 0;

    // 顯示接下來 24 小時
    for (let i = startIndex; i < startIndex + 24; i++) {
        if (!hourly.time[i]) break;
        
        const timeStr = new Date(hourly.time[i]);
        // 如果是現在這個小時，顯示「現在」，否則顯示 HH
        const hourLabel = i === startIndex ? "現在" : timeStr.getHours().toString().padStart(2, '0');
        const code = hourly.weather_code[i];
        const temp = Math.round(hourly.temperature_2m[i]);

        const el = document.createElement('div');
        el.className = 'hourly-item';
        el.innerHTML = `
            <span class="hourly-time">${hourLabel}</span>
            <span class="hourly-icon">${getWeatherStatus(code).icon}</span>
            <span class="hourly-temp">${temp}°</span>
        `;
        hourlyContainer.appendChild(el);
    }

    // 2. 每日預報 (Daily) - 含溫度條與小白點
    const dailyContainer = document.getElementById('daily-container');
    dailyContainer.innerHTML = ''; 

    // 計算本週全域最低與最高溫 (用於繪製溫度條比例)
    const weekMins = daily.temperature_2m_min.slice(0, 7);
    const weekMaxs = daily.temperature_2m_max.slice(0, 7);
    const minWeekly = Math.min(...weekMins);
    const maxWeekly = Math.max(...weekMaxs);
    const rangeTotal = maxWeekly - minWeekly;

    for (let i = 0; i < 7; i++) {
        const dayName = i === 0 ? "今天" : getDayName(daily.time[i]);
        const code = daily.weather_code[i];
        const dayMin = Math.round(daily.temperature_2m_min[i]);
        const dayMax = Math.round(daily.temperature_2m_max[i]);

        // 計算橫條位置與寬度 %
        const leftPercent = rangeTotal === 0 ? 0 : ((dayMin - minWeekly) / rangeTotal) * 100;
        const widthPercent = rangeTotal === 0 ? 100 : ((dayMax - dayMin) / rangeTotal) * 100;

        // 處理小白點 (只在今天顯示)
        let dotHtml = '';
        if (i === 0) {
            let dotPercent = ((currentTemp - minWeekly) / rangeTotal) * 100;
            // 限制範圍防止超出
            if (dotPercent < 0) dotPercent = 0;
            if (dotPercent > 100) dotPercent = 100;
            
            dotHtml = `<div class="current-temp-dot" style="left: ${dotPercent}%;"></div>`;
        }

        const el = document.createElement('div');
        el.className = 'daily-row';
        el.innerHTML = `
            <span class="day-name">${dayName}</span>
            <span class="day-icon">${getWeatherStatus(code).icon}</span>
            <span class="min-temp">${dayMin}°</span>
            
            <div class="temp-bar-container">
                <div class="temp-bar-fill" style="left: ${leftPercent}%; width: ${widthPercent}%;"></div>
                ${dotHtml}
            </div>

            <span class="max-temp">${dayMax}°</span>
        `;
        dailyContainer.appendChild(el);
    }
}

// 程式進入點
initWeather();