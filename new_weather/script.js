let currentConfig = { lat: 25.0330, lon: 121.5654, name: "台北" };

// ===== 工具函式 =====
function getWeatherIconClass(code, isDay = 1) {
    if (code === 0) return isDay ? 'bi-sun-fill' : 'bi-moon-stars-fill';
    if (code <= 3) return isDay ? 'bi-cloud-sun-fill' : 'bi-cloud-moon-fill';
    if (code <= 48) return 'bi-cloud-haze2-fill';
    if (code <= 67) return 'bi-cloud-drizzle-fill';
    if (code <= 77) return 'bi-snow';
    if (code <= 82) return 'bi-cloud-rain-heavy-fill';
    if (code <= 99) return 'bi-cloud-lightning-rain-fill';
    return 'bi-question-circle';
}

function getWeatherDesc(code) {
    const map = { 0: "晴朗", 1: "大致晴朗", 2: "局部多雲", 3: "陰天", 45: "霧", 48: "霧凇", 51: "毛毛雨", 61: "小雨", 63: "中雨", 65: "大雨", 80: "陣雨", 95: "雷雨" };
    return map[code] || "未知";
}

// 蒲福氏風級轉換 (km/h)
function getBeaufortScale(kmh) {
    if (kmh < 1) return 0;
    if (kmh < 6) return 1;
    if (kmh < 12) return 2;
    if (kmh < 20) return 3;
    if (kmh < 29) return 4;
    if (kmh < 39) return 5;
    if (kmh < 50) return 6;
    if (kmh < 62) return 7;
    if (kmh < 75) return 8;
    return 9; // 簡化處理高風速
}

// 風向角度轉文字
function getWindDirText(deg) {
    const directions = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
    return directions[Math.round(deg / 45) % 8] + "風";
}

// 紫外線等級
function getUVDesc(index) {
    if (index <= 2) return "低量級";
    if (index <= 5) return "中量級";
    if (index <= 7) return "高量級";
    if (index <= 10) return "過量級";
    return "危險級";
}

// ===== 主流程 =====
async function initWeather() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                currentConfig.lat = pos.coords.latitude;
                currentConfig.lon = pos.coords.longitude;
                currentConfig.name = "目前位置";
                fetchWeather();
            },
            () => fetchWeather() // 失敗就用預設
        );
    } else {
        fetchWeather();
    }
}

async function fetchWeather() {
    // 增加請求欄位: apparent_temperature, wind_speed, uv_index, humidity, visibility, pressure, sunrise/set, precipitation
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${currentConfig.lat}&longitude=${currentConfig.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,surface_pressure,precipitation&hourly=temperature_2m,weather_code,is_day,uv_index,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum&timezone=auto&forecast_days=10`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        updateUI(data);
        updateBackground(data.current);
    } catch (err) {
        console.error(err);
        document.getElementById('city-name').innerText = "連線失敗";
    }
}

function updateUI(data) {
    const cur = data.current;
    const hourly = data.hourly;
    const daily = data.daily;

    // 1. Header 基礎資訊
    document.getElementById('city-name').innerHTML = `<i class="bi bi-geo-alt-fill"></i> ${currentConfig.name}`;
    document.getElementById('current-temp').innerText = `${Math.round(cur.temperature_2m)}°`;
    document.getElementById('weather-desc').innerText = getWeatherDesc(cur.weather_code);
    document.getElementById('max-temp').innerText = `H:${Math.round(daily.temperature_2m_max[0])}°`;
    document.getElementById('min-temp').innerText = `L:${Math.round(daily.temperature_2m_min[0])}°`;

    // 2. 每小時列表 (前24小)
    const hourlyContainer = document.getElementById('hourly-list');
    hourlyContainer.innerHTML = '';
    const currentHour = new Date().getHours();
    
    for (let i = currentHour; i < currentHour + 24; i++) {
        if (!hourly.time[i]) break;
        const hTime = new Date(hourly.time[i]).getHours();
        const displayTime = i === currentHour ? "現在" : `${hTime}時`;
        const icon = getWeatherIconClass(hourly.weather_code[i], hourly.is_day[i]);
        
        hourlyContainer.innerHTML += `
            <div class="hourly-item">
                <span>${displayTime}</span>
                <i class="${icon} hourly-icon"></i>
                <span>${Math.round(hourly.temperature_2m[i])}°</span>
            </div>`;
    }

    // 3. 每日預報 (10天)
    const dailyContainer = document.getElementById('daily-list');
    dailyContainer.innerHTML = '';
    const weekMin = Math.min(...daily.temperature_2m_min);
    const weekMax = Math.max(...daily.temperature_2m_max);
    const range = weekMax - weekMin || 1;
    const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

    for (let i = 0; i < daily.time.length; i++) {
        const d = new Date(daily.time[i]);
        const dName = i === 0 ? "今天" : days[d.getDay()];
        const icon = getWeatherIconClass(daily.weather_code[i], 1);
        const min = Math.round(daily.temperature_2m_min[i]);
        const max = Math.round(daily.temperature_2m_max[i]);
        const left = ((min - weekMin)/range)*100;
        const width = ((max - min)/range)*100;

        dailyContainer.innerHTML += `
            <div class="daily-row">
                <span class="day-name">${dName}</span>
                <div style="width:30px;text-align:center"><i class="${icon}"></i></div>
                <div style="opacity:0.7">${min}°</div>
                <div class="temp-bar-container"><div class="temp-bar" style="left:${left}%; width:${width}%"></div></div>
                <div style="font-weight:600">${max}°</div>
            </div>`;
    }

    // 4. 詳細資訊 Grid (新功能核心)
    
    // 體感
    document.getElementById('detail-feels-like').innerText = `${Math.round(cur.apparent_temperature)}°`;
    document.getElementById('detail-actual-temp').innerText = `${Math.round(cur.temperature_2m)}°`;

    // 紫外線 (取目前小時的 UV)
    const uvNow = hourly.uv_index[currentHour] || 0;
    document.getElementById('detail-uv').innerText = uvNow;
    document.getElementById('detail-uv-text').innerText = getUVDesc(uvNow);
    document.getElementById('uv-bar').style.width = Math.min((uvNow / 11) * 100, 100) + "%";

    // 風速與羅盤
    const windSpeed = cur.wind_speed_10m;
    const windDir = cur.wind_direction_10m;
    document.getElementById('wind-speed').innerText = `${windSpeed} km/h`;
    document.getElementById('wind-gusts').innerText = `${cur.wind_gusts_10m} km/h`;
    document.getElementById('wind-dir-text').innerText = getWindDirText(windDir);
    const beaufort = getBeaufortScale(windSpeed);
    document.getElementById('wind-beaufort').innerText = `${beaufort}級`;
    // 旋轉羅盤箭頭 (加上 180 度因為圖標預設向上，風向是來源方向)
    document.getElementById('compass-arrow').style.transform = `rotate(${windDir}deg)`;

    // 日出日落
    const sunrise = new Date(daily.sunrise[0]);
    const sunset = new Date(daily.sunset[0]);
    const formatTime = (date) => date.toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12: false});
    document.getElementById('sunrise-time').innerText = formatTime(sunrise);
    document.getElementById('sunset-time').innerText = formatTime(sunset);
    // 簡單模擬太陽位置 (白天在中間，晚上在兩側，這裡僅做靜態曲線示意)
    
    // 降水
    document.getElementById('precip-val').innerText = `${cur.precipitation} mm`;

    // 能見度 (轉公里)
    const visKm = hourly.visibility[currentHour] / 1000;
    document.getElementById('visibility-val').innerText = `${Math.round(visKm)} 公里`;

    // 濕度
    document.getElementById('humidity-val').innerText = `${cur.relative_humidity_2m}%`;
    // 露點簡單估算 (T - (100-RH)/5)
    const dewPoint = Math.round(cur.temperature_2m - ((100 - cur.relative_humidity_2m) / 5));
    document.getElementById('dew-point').innerText = `露點 ${dewPoint}°`;

    // 氣壓表 (960 ~ 1060 hPa)
    const pressure = cur.surface_pressure;
    document.getElementById('pressure-val').innerText = Math.round(pressure).toLocaleString();
    // 計算指針角度 (-135deg ~ 135deg 對應 960 ~ 1060)
    const pMin = 960, pMax = 1060;
    let pPercent = (pressure - pMin) / (pMax - pMin);
    if(pPercent < 0) pPercent = 0; if(pPercent > 1) pPercent = 1;
    const deg = -135 + (pPercent * 270);
    document.getElementById('pressure-needle').style.transform = `rotate(${deg}deg)`;
}

// ===== 背景動畫 (保持原樣) =====
const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
let particles = [];
let effectType = 'clear';

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function updateBackground(current) {
    const code = current.weather_code;
    const isDay = current.is_day;
    const body = document.body;

    if (isDay) {
        if (code <= 3) { body.style.background = "linear-gradient(to bottom, #4facfe, #00f2fe)"; effectType = 'cloud'; }
        else if (code >= 51) { body.style.background = "linear-gradient(to bottom, #4b6cb7, #182848)"; effectType = 'rain'; }
        else { body.style.background = "linear-gradient(to bottom, #bdc3c7, #2c3e50)"; effectType = 'cloud'; }
    } else {
        if (code >= 51) { body.style.background = "linear-gradient(to bottom, #0f2027, #203a43, #2c5364)"; effectType = 'rain'; }
        else { body.style.background = "linear-gradient(to bottom, #141e30, #243b55)"; effectType = 'star'; }
    }
    initParticles();
}

class Particle {
    constructor(type) { this.type = type; this.reset(); }
    reset() {
        if (this.type === 'star') {
            this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2; this.speed = Math.random() * 0.2; this.opacity = Math.random();
        } else if (this.type === 'rain') {
            this.x = Math.random() * canvas.width; this.y = Math.random() * -canvas.height;
            this.size = Math.random() * 20 + 10; this.speed = Math.random() * 5 + 10;
        } else if (this.type === 'cloud') {
            this.x = Math.random() * canvas.width; this.y = Math.random() * (canvas.height/2);
            this.size = Math.random() * 50 + 20; this.speed = Math.random() * 0.5 + 0.1; this.opacity = Math.random()*0.3;
        }
    }
    update() {
        if (this.type === 'star') {
            this.opacity += (Math.random()-0.5)*0.05;
            if(this.opacity<0) this.opacity=0; if(this.opacity>1) this.opacity=1;
        } else if (this.type === 'rain') {
            this.y += this.speed; if(this.y > canvas.height) this.reset();
        } else if (this.type === 'cloud') {
            this.x += this.speed; if(this.x > canvas.width) this.x = -this.size;
        }
    }
    draw() {
        ctx.beginPath();
        if(this.type === 'star') { ctx.fillStyle = `rgba(255,255,255,${this.opacity})`; ctx.arc(this.x,this.y,this.size,0,Math.PI*2); ctx.fill(); }
        else if(this.type === 'rain') { ctx.strokeStyle = "rgba(174,194,224,0.5)"; ctx.lineWidth=1; ctx.moveTo(this.x,this.y); ctx.lineTo(this.x,this.y+this.size); ctx.stroke(); }
        else if(this.type === 'cloud') { ctx.fillStyle = `rgba(255,255,255,${this.opacity})`; ctx.arc(this.x,this.y,this.size,0,Math.PI*2); ctx.fill(); }
    }
}

function initParticles() {
    particles = [];
    let count = effectType === 'rain' ? 100 : (effectType === 'star' ? 80 : 15);
    for(let i=0; i<count; i++) particles.push(new Particle(effectType));
}
function animate() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
}
animate();
initWeather();