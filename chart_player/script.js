// --- 全域變數 ---
let canvas, ctx;
let chartData = null;
let audioBuffer = null;     
let audioContext = null;
let audioSource = null;
let startTime = 0;
let isPlaying = false;
let isPaused = false;
let pausedAt = 0;
let animationFrameId = null;

// 音量控制節點
let musicGainNode = null;
let seGainNode = null;

// 音效 Buffers
const seBuffers = {
    tap: null,  
    drag: null, 
    flick: null 
};

// 背景圖片狀態
let hasBackground = false;
// 固定模式狀態
let isFixedMode = false;
// 按鍵大小倍率
let noteSizeMultiplier = 1.0;
// **UI (文字) 大小倍率**
let uiScaleMultiplier = 1.0;

// 拖動進度條狀態
let isDraggingBar = false;
let wasPlayingBeforeDrag = false;

// RPE 標準解析度
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const OFFICIAL_WIDTH_FACTOR = 1350; 
const OFFICIAL_HEIGHT_FACTOR = 900; 

let scaleRatio = 1;

// 遊戲狀態
let combo = 0;
let totalNotes = 0;
let hitEffects = []; 

// 譜面資料結構
let bpmMap = []; 
let lines = [];  

// DOM 元素
const uiContainer = document.getElementById('ui-container'); 
const btnPlay = document.getElementById('btnPlay');
const btnStop = document.getElementById('btnStop');
const btnFullScreen = document.getElementById('btnFullScreen');
const statusMsg = document.getElementById('statusMsg');
const timeDisplay = document.getElementById('timeDisplay');
const bgLayer = document.getElementById('bgLayer');
const fixedModeCheck = document.getElementById('fixedModeCheck');
const musicVolumeSlider = document.getElementById('musicVolume');
const seVolumeSlider = document.getElementById('seVolume');
const comboTextInput = document.getElementById('comboTextInput');
const songNameInput = document.getElementById('songNameInput');
const difficultyInput = document.getElementById('difficultyInput');
// Slider DOM
const noteSizeSlider = document.getElementById('noteSizeSlider');
const noteSizeVal = document.getElementById('noteSizeVal');
const uiScaleSlider = document.getElementById('uiScaleSlider');
const uiScaleVal = document.getElementById('uiScaleVal');

// --- 初始化 ---
window.onload = () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 檔案監聽
    document.getElementById('chartInput').addEventListener('change', handleChartUpload);
    document.getElementById('audioInput').addEventListener('change', handleAudioUpload);
    document.getElementById('bgInput').addEventListener('change', handleBgUpload);
    
    // 音效監聽
    document.getElementById('seTapInput').addEventListener('change', (e) => handleSeUpload(e, 'tap'));
    document.getElementById('seDragInput').addEventListener('change', (e) => handleSeUpload(e, 'drag'));
    document.getElementById('seFlickInput').addEventListener('change', (e) => handleSeUpload(e, 'flick'));
    
    // 選項切換與輸入監聽
    fixedModeCheck.addEventListener('change', (e) => {
        isFixedMode = e.target.checked;
        redrawIfPaused();
    });
    
    [comboTextInput, songNameInput, difficultyInput].forEach(input => {
        input.addEventListener('input', redrawIfPaused);
    });

    // 大小調節監聽
    noteSizeSlider.addEventListener('input', (e) => {
        noteSizeMultiplier = e.target.value / 100;
        noteSizeVal.textContent = e.target.value + '%';
        redrawIfPaused();
    });

    // **修改：UI 大小調節現在只影響變數，不縮放側邊欄**
    uiScaleSlider.addEventListener('input', (e) => {
        uiScaleMultiplier = e.target.value / 100;
        uiScaleVal.textContent = e.target.value + '%';
        redrawIfPaused(); // 立即重繪 Canvas 以顯示效果
    });

    // 音量監聽
    musicVolumeSlider.addEventListener('input', updateVolumes);
    seVolumeSlider.addEventListener('input', updateVolumes);

    // Canvas 拖動進度條
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    window.addEventListener('mouseup', handleCanvasMouseUp);

    // 按鈕
    btnPlay.addEventListener('click', togglePlay);
    btnStop.addEventListener('click', stopAudio);
    btnFullScreen.addEventListener('click', toggleFullScreen);

    // 鍵盤
    window.addEventListener('keydown', handleKeyDown);

    // 全螢幕狀態
    document.addEventListener('fullscreenchange', handleFullScreenChange);
};

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    scaleRatio = canvas.width / BASE_WIDTH;
    redrawIfPaused();
}

function redrawIfPaused() {
    if (!isPlaying && chartData) render(isPaused ? pausedAt : 0);
}

// --- 鍵盤與全螢幕邏輯 ---

function handleKeyDown(e) {
    if (e.code === 'Space') {
        if (document.activeElement.tagName === 'INPUT') return;
        e.preventDefault(); 
        togglePlay();
    }
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(err);
        });
    } else {
        document.exitFullscreen();
    }
}

function handleFullScreenChange() {
    if (document.fullscreenElement) {
        uiContainer.style.display = 'none';
        statusMsg.textContent = "按 Esc 退出全螢幕";
    } else {
        uiContainer.style.display = 'block';
    }
    resizeCanvas(); 
}

// --- 進度條拖動邏輯 ---

function handleCanvasMouseDown(e) {
    if (!audioBuffer) return;
    const hitZoneHeight = 25 * scaleRatio; 
    const rect = canvas.getBoundingClientRect();
    const clickY = e.clientY - rect.top;

    if (clickY <= hitZoneHeight) {
        isDraggingBar = true;
        wasPlayingBeforeDrag = isPlaying;
        if (isPlaying) pauseAudio(); 
        updateProgressByMouse(e);
    }
}

function handleCanvasMouseMove(e) {
    const hitZoneHeight = 25 * scaleRatio;
    const rect = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    
    if (mouseY <= hitZoneHeight) canvas.style.cursor = "pointer";
    else canvas.style.cursor = "default";

    if (isDraggingBar) updateProgressByMouse(e);
}

function handleCanvasMouseUp(e) {
    if (isDraggingBar) {
        isDraggingBar = false;
        if (wasPlayingBeforeDrag) playAudio();
    }
}

function updateProgressByMouse(e) {
    if (!audioBuffer) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const progress = mouseX / rect.width;
    pausedAt = progress * audioBuffer.duration;
    render(pausedAt);
    updateUI(pausedAt);
}

// --- 檔案處理 ---

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        musicGainNode = audioContext.createGain();
        seGainNode = audioContext.createGain();
        musicGainNode.connect(audioContext.destination);
        seGainNode.connect(audioContext.destination);
        updateVolumes();
    }
}

function updateVolumes() {
    if (musicGainNode) musicGainNode.gain.value = musicVolumeSlider.value / 100;
    if (seGainNode) seGainNode.gain.value = seVolumeSlider.value / 100;
}

function handleChartUpload(e) {
    stopAudio(); 
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target.result);
            if (json.formatVersion !== undefined) {
                console.log("偵測到官方格式，進行轉換...");
                const rpeJson = convertOfficialToRPE(json);
                parseChart(rpeJson);
                statusMsg.textContent = "官方譜面轉換並解析成功！";
            } else {
                console.log("偵測到 RPE 格式...");
                parseChart(json);
                statusMsg.textContent = "RPE 譜面解析成功！";
            }
            checkReady();
        } catch (err) {
            console.error(err);
            statusMsg.textContent = "譜面格式錯誤！請確認 JSON 內容。";
        }
    };
    reader.readAsText(file);
}

function handleAudioUpload(e) {
    stopAudio(); 
    const file = e.target.files[0];
    if (!file) return;
    initAudioContext();
    const reader = new FileReader();
    reader.onload = (event) => {
        const audioData = event.target.result;
        audioContext.decodeAudioData(audioData, (buffer) => {
            audioBuffer = buffer;
            statusMsg.textContent = "音樂載入完成！";
            checkReady();
        });
    };
    reader.readAsArrayBuffer(file);
}

function handleBgUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        bgLayer.src = event.target.result;
        bgLayer.style.display = 'block';
        hasBackground = true;
        redrawIfPaused();
    };
    reader.readAsDataURL(file);
}

function handleSeUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    initAudioContext();
    const reader = new FileReader();
    reader.onload = (event) => {
        const audioData = event.target.result;
        audioContext.decodeAudioData(audioData, (buffer) => {
            seBuffers[type] = buffer;
            statusMsg.textContent = `${type.toUpperCase()} 音效載入完成！`;
        });
    };
    reader.readAsArrayBuffer(file);
}

// 官方格式轉 RPE
function convertOfficialToRPE(officialJson) {
    const rpeChart = {
        BPMList: [],
        judgeLineList: []
    };
    const baseBPM = officialJson.judgeLineList[0].bpm || 120;
    rpeChart.BPMList.push({ bpm: baseBPM, startTime: [0, 0, 1] });

    rpeChart.judgeLineList = officialJson.judgeLineList.map(line => {
        const layer = {
            moveXEvents: [], moveYEvents: [], rotateEvents: [], alphaEvents: [], speedEvents: []
        };

        if (line.judgeLineMoveEvents) {
            line.judgeLineMoveEvents.forEach(e => {
                const startBeat = e.startTime / 32; const endBeat = e.endTime / 32;
                const startX = (e.start - 0.5) * OFFICIAL_WIDTH_FACTOR;
                const endX = (e.end - 0.5) * OFFICIAL_WIDTH_FACTOR;
                const startY = (e.start2 - 0.5) * OFFICIAL_HEIGHT_FACTOR;
                const endY = (e.end2 - 0.5) * OFFICIAL_HEIGHT_FACTOR;
                layer.moveXEvents.push({ startTime: [startBeat, 0, 1], endTime: [endBeat, 0, 1], start: startX, end: endX, easingType: 1 });
                layer.moveYEvents.push({ startTime: [startBeat, 0, 1], endTime: [endBeat, 0, 1], start: startY, end: endY, easingType: 1 });
            });
        }
        if (line.judgeLineRotateEvents) {
            line.judgeLineRotateEvents.forEach(e => {
                layer.rotateEvents.push({ startTime: [e.startTime / 32, 0, 1], endTime: [e.endTime / 32, 0, 1], start: e.start, end: e.end, easingType: 1 });
            });
        }
        if (line.judgeLineDisappearEvents) {
            line.judgeLineDisappearEvents.forEach(e => {
                layer.alphaEvents.push({ startTime: [e.startTime / 32, 0, 1], endTime: [e.endTime / 32, 0, 1], start: e.start * 255, end: e.end * 255, easingType: 1 });
            });
        }
        if (line.speedEvents) {
            line.speedEvents.forEach(e => {
                layer.speedEvents.push({ startTime: [e.startTime / 32, 0, 1], endTime: [e.endTime / 32, 0, 1], start: e.value, end: e.value, easingType: 1 });
            });
        }

        const rpeNotes = [];
        const processNote = (n, aboveVal) => {
            let myType = 1;
            if (n.type === 1) myType = 1;      
            else if (n.type === 2) myType = 4; 
            else if (n.type === 3) myType = 2; 
            else if (n.type === 4) myType = 3; 

            const startBeat = n.time / 32;
            const endBeat = (n.time + n.holdTime) / 32;
            let finalSpeed = n.speed;
            if (n.type === 3) finalSpeed = 1.0; 

            rpeNotes.push({
                type: myType,
                startTime: [startBeat, 0, 1],
                endTime: [endBeat, 0, 1],
                positionX: n.positionX * (OFFICIAL_WIDTH_FACTOR / 18),
                speed: finalSpeed, size: 1.0, above: aboveVal, visibleTime: 999999, alpha: 255
            });
        };
        if (line.notesAbove) line.notesAbove.forEach(n => processNote(n, 1)); 
        if (line.notesBelow) line.notesBelow.forEach(n => processNote(n, 2)); 
        
        return { eventLayers: [layer], notes: rpeNotes, Texture: "line.png", father: -1 };
    });
    return rpeChart;
}

function checkReady() {
    if (chartData && audioBuffer) {
        btnPlay.disabled = false;
        btnStop.disabled = false;
        resetGameState();
        render(0); 
    }
}

function playHitSound(type) {
    if (!audioContext || !seGainNode) return;
    let buffer = null;
    if (type === 1 || type === 2) buffer = seBuffers.tap;
    else if (type === 3) buffer = seBuffers.flick;
    else if (type === 4) buffer = seBuffers.drag;
    if (!buffer) buffer = seBuffers.tap;

    if (buffer) {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(seGainNode); 
        source.start(0);
    }
}

// --- RPE 解析與渲染核心 ---

function rpeTimeToBeats(t) {
    if (Array.isArray(t)) return t[0] + (t[1] / t[2]);
    if (typeof t === 'number') return t; 
    return 0;
}

function parseBPM(bpmList) {
    bpmList.sort((a, b) => rpeTimeToBeats(a.startTime) - rpeTimeToBeats(b.startTime));
    let currentSec = 0;
    let currentBeat = 0;
    const map = [];
    for (let i = 0; i < bpmList.length; i++) {
        const bpmObj = bpmList[i];
        const startBeat = rpeTimeToBeats(bpmObj.startTime);
        const bpm = bpmObj.bpm;
        if (i > 0) {
            const prevBpm = bpmList[i-1].bpm;
            const deltaBeat = startBeat - currentBeat;
            currentSec += deltaBeat * (60 / prevBpm);
        }
        currentBeat = startBeat;
        map.push({ beat: startBeat, sec: currentSec, bpm: bpm });
    }
    return map;
}

function beatToSec(beat) {
    for (let i = bpmMap.length - 1; i >= 0; i--) {
        if (beat >= bpmMap[i].beat) {
            const delta = beat - bpmMap[i].beat;
            return bpmMap[i].sec + delta * (60 / bpmMap[i].bpm);
        }
    }
    return beat * (60 / (bpmMap[0]?.bpm || 120));
}

function preprocessSpeedIntegration(line) {
    let allSpeedEvents = [];
    line.layers.forEach(layer => {
        if(layer.speedEvents) allSpeedEvents = allSpeedEvents.concat(layer.speedEvents);
    });
    allSpeedEvents.sort((a, b) => a.startSec - b.startSec);
    if (allSpeedEvents.length === 0) {
        line.yPosIntegration = [{ time: 0, y: 0, speed: 1.0 }];
        return;
    }
    const segments = [];
    let currentY = 0;
    let currentTime = 0;
    if (allSpeedEvents[0].startSec > 0) {
        segments.push({ time: 0, y: 0, speed: 1.0 });
    }
    allSpeedEvents.forEach(e => {
        const lastSeg = segments.length > 0 ? segments[segments.length - 1] : {time: 0, y: 0, speed: 1.0};
        if (e.startSec > lastSeg.time) {
            const dt = e.startSec - lastSeg.time;
            currentY = lastSeg.y + dt * lastSeg.speed;
            currentTime = e.startSec;
        } else {
            currentTime = e.startSec; 
        }
        segments.push({ time: currentTime, y: currentY, speed: e.startVal });
    });
    line.yPosIntegration = segments;
}

function getLineYPos(line, time) {
    const segs = line.yPosIntegration;
    if (!segs || segs.length === 0) return time; 
    let activeSeg = segs[0];
    for (let i = 1; i < segs.length; i++) {
        if (time >= segs[i].time) {
            activeSeg = segs[i];
        } else {
            break;
        }
    }
    return activeSeg.y + (time - activeSeg.time) * activeSeg.speed;
}

function parseChart(json) {
    chartData = json;
    
    // 自動填入 RPE META
    if (json.META) {
        if (json.META.name) songNameInput.value = json.META.name;
        if (json.META.level) difficultyInput.value = json.META.level;
    }

    bpmMap = parseBPM(json.BPMList || [{bpm: 120, startTime: [0,0,1]}]);
    let allNotes = [];
    totalNotes = 0; 
    lines = json.judgeLineList.map((line, lineIndex) => {
        const layers = line.eventLayers.map(layer => {
            const processEvents = (events) => {
                if(!events) return [];
                return events.map(e => ({
                    startSec: beatToSec(rpeTimeToBeats(e.startTime)),
                    endSec: beatToSec(rpeTimeToBeats(e.endTime)),
                    startVal: e.start,
                    endVal: e.end,
                    easingType: e.easingType || 1 
                }));
            };
            return {
                moveX: processEvents(layer.moveXEvents),
                moveY: processEvents(layer.moveYEvents),
                rotate: processEvents(layer.rotateEvents),
                alpha: processEvents(layer.alphaEvents),
                speed: processEvents(layer.speedEvents)
            };
        });
        const lineObj = { 
            layers, 
            notes: [], 
            texture: line.Texture,
            father: line.father !== undefined ? line.father : -1,
            index: lineIndex
        };
        preprocessSpeedIntegration(lineObj);
        const notes = line.notes.map(note => {
            const startBeat = rpeTimeToBeats(note.startTime);
            const endBeat = rpeTimeToBeats(note.endTime);
            const n = {
                ...note,
                sec: beatToSec(startBeat), endSec: beatToSec(endBeat),
                type: note.type, visibleTimeSec: note.visibleTime,
                above: note.above !== undefined ? note.above : 1,
                alpha: note.alpha !== undefined ? note.alpha : 255,
                lineIndex: lineIndex, isMulti: false, isHit: false 
            };
            allNotes.push(n);
            totalNotes++; 
            return n;
        });
        notes.sort((a, b) => a.sec - b.sec);
        lineObj.notes = notes;
        return lineObj;
    });
    allNotes.sort((a, b) => a.sec - b.sec);
    for (let i = 0; i < allNotes.length - 1; i++) {
        const current = allNotes[i];
        const next = allNotes[i+1];
        if (Math.abs(current.sec - next.sec) < 0.01) {
            current.isMulti = true; next.isMulti = true;
        }
    }
}

function resetGameState() {
    combo = 0;
    hitEffects = [];
    if (lines) {
        lines.forEach(line => {
            line.notes.forEach(note => { note.isHit = false; });
        });
    }
}

function togglePlay() {
    if (isPlaying) pauseAudio();
    else playAudio();
}

function playAudio() {
    if (!audioBuffer) return;
    initAudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();

    if (isPaused) {
        startTime = audioContext.currentTime - pausedAt;
    } else {
        startTime = audioContext.currentTime;
        resetGameState();
    }

    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(musicGainNode); 
    
    let offset = isPaused ? pausedAt : 0;
    if (offset < 0) offset = 0;
    if (offset >= audioBuffer.duration) offset = 0;

    audioSource.start(0, offset);
    audioSource.onended = () => {
        if (isPlaying && (audioContext.currentTime - startTime) >= audioBuffer.duration) {
            stopAudio();
        }
    };
    
    isPlaying = true; isPaused = false;
    if (!animationFrameId) renderLoop();
    btnPlay.innerText = "暫停 (Space)";
}

function pauseAudio() {
    if (audioSource) {
        try { audioSource.stop(); } catch(e) {}
        pausedAt = audioContext.currentTime - startTime;
        isPaused = true; isPlaying = false;
        btnPlay.innerText = "播放 (Space)";
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
        }
    }
}

function stopAudio() {
    if (audioSource) try { audioSource.stop(); } catch(e){}
    isPlaying = false; isPaused = false; pausedAt = 0;
    btnPlay.innerText = "播放 (Space)";
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId); animationFrameId = null;
    }
    resetGameState();
    render(0); 
}

function renderLoop() {
    if (isPlaying) {
        const currentTime = audioContext.currentTime - startTime;
        render(currentTime);
        updateUI(currentTime);
        animationFrameId = requestAnimationFrame(renderLoop);
    } else {
        animationFrameId = null;
    }
}

// --- 渲染系統 ---

function getInterpolatedValue(events, time) {
    let val = 0;
    for (let e of events) {
        if (time >= e.startSec && time <= e.endSec) {
            const progress = (time - e.startSec) / (e.endSec - e.startSec);
            val = e.startVal + (e.endVal - e.startVal) * progress;
            return val;
        }
        if (time > e.endSec) {
            val = e.endVal;
        }
    }
    return val;
}

function calculateLineState(line, time) {
    let localX = 0; let localY = 0; let localAngle = 0; let localAlpha = 255;
    
    line.layers.forEach((layer, index) => {
        localX += getInterpolatedValue(layer.moveX, time);
        localY += getInterpolatedValue(layer.moveY, time);
        localAngle += getInterpolatedValue(layer.rotate, time);
        if (layer.alpha && layer.alpha.length > 0) {
             localAlpha = getInterpolatedValue(layer.alpha, time);
        }
    });

    if (line.father === -1) {
        return { x: localX, y: localY, angle: localAngle, alpha: localAlpha };
    }

    const fatherLine = lines[line.father];
    if (!fatherLine) return { x: localX, y: localY, angle: localAngle, alpha: localAlpha };

    const fatherState = calculateLineState(fatherLine, time);

    const rad = -fatherState.angle * Math.PI / 180; 
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const globalX = fatherState.x + (localX * cos - localY * sin);
    const globalY = fatherState.y + (localX * sin + localY * cos);
    
    const globalAngle = fatherState.angle + localAngle;
    const globalAlpha = localAlpha; 

    return { x: globalX, y: globalY, angle: globalAngle, alpha: globalAlpha };
}

function updateUI(time) {
    if(audioBuffer) {
        const t = Math.max(0, time);
        const total = audioBuffer.duration;
        timeDisplay.innerText = `${formatTime(t)} / ${formatTime(total)}`;
    }
}

function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

class HitEffect {
    constructor(x, y) {
        this.x = x; this.y = y; this.color = "#ffeb3b"; 
        this.startTime = Date.now(); this.lifeTime = 300; 
        this.maxSize = 150 * scaleRatio;
    }
    draw(ctx) {
        const elapsed = Date.now() - this.startTime;
        if (elapsed > this.lifeTime) return false;
        const progress = elapsed / this.lifeTime;
        const size = this.maxSize * Math.sin(progress * Math.PI / 2); 
        const alpha = 1 - progress;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 5 * scaleRatio;
        ctx.strokeRect(-size/2, -size/2, size, size);
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillRect(-size/4, -size/4, size/2, size/2);
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(0, 0, size/1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return true;
    }
}

function spawnHitEffect(x, y) {
    hitEffects.push(new HitEffect(x, y));
}

function render(time) {
    if (hasBackground) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!lines.length) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    lines.forEach(line => {
        const state = calculateLineState(line, time);
        
        if (isFixedMode) {
            state.x = 0; state.y = -360; state.angle = 0;
            if(state.alpha < 50) state.alpha = 50; 
        }

        ctx.save();
        const drawX = cx + state.x * scaleRatio;
        const drawY = cy - state.y * scaleRatio; 
        
        ctx.translate(drawX, drawY);
        ctx.rotate(-state.angle * Math.PI / 180); 

        if (state.alpha > 0) {
            ctx.save();
            ctx.globalAlpha = state.alpha / 255; 
            ctx.strokeStyle = "#ffeb3b"; ctx.lineWidth = 4 * scaleRatio;
            ctx.beginPath(); ctx.moveTo(-2000 * scaleRatio, 0); ctx.lineTo(2000 * scaleRatio, 0); ctx.stroke();
            ctx.restore();
        }

        const otherNotes = line.notes.filter(n => n.type !== 3);
        const flickNotes = line.notes.filter(n => n.type === 3);
        const renderList = [...otherNotes, ...flickNotes];

        const speedScale = 1200; 
        const currentLineY = getLineYPos(line, time);

        renderList.forEach(note => {
            const isHold = (note.type === 2);
            
            if (!note.isHit && isPlaying) {
                if (time >= note.sec) {
                    note.isHit = true; combo++; 
                    playHitSound(note.type);
                    const noteLocalX = note.positionX * scaleRatio;
                    const rad = -state.angle * Math.PI / 180;
                    const cos = Math.cos(rad); const sin = Math.sin(rad);
                    const effectX = drawX + (noteLocalX * cos);
                    const effectY = drawY + (noteLocalX * sin);
                    spawnHitEffect(effectX, effectY);
                }
            }

            // Note大小倍率應用
            const noteW = 130 * scaleRatio * note.size * noteSizeMultiplier;
            const noteH = 18 * scaleRatio * noteSizeMultiplier;

            if (isHold && isPlaying && time >= note.sec && time <= note.endSec) {
                const noteLocalX = note.positionX * scaleRatio;
                ctx.save();
                ctx.translate(noteLocalX, 0);
                const pulse = (Math.sin(Date.now() / 50) + 1) / 2; 
                const glowSize = 1.2 + pulse * 0.3; 
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = "#ffeb3b"; 
                ctx.fillRect((-noteW/2) * glowSize, (-noteH/2) * glowSize, noteW * glowSize, noteH * glowSize);
                ctx.fillStyle = "#ffffff";
                ctx.globalAlpha = 0.8;
                ctx.fillRect(-noteW/2, -noteH/2, noteW, noteH);
                ctx.restore();
            }

            if (isHold) {
                if (time >= note.endSec) return;
            } else {
                if (time >= note.sec) return;
            }
            if (note.sec > time + 5) return;

            ctx.globalAlpha = note.alpha / 255;
            const direction = (note.above === 2) ? 1 : -1;
            const distX = note.positionX * scaleRatio;

            if (note.type === 1) ctx.fillStyle = "#00d2ff";      
            else if (note.type === 2) ctx.fillStyle = "#00d2ff"; 
            else if (note.type === 3) ctx.fillStyle = "#ff0055"; 
            else ctx.fillStyle = "#ffee00";                      

            const noteStartY = getLineYPos(line, note.sec);
            const rawDist = (noteStartY - currentLineY) * note.speed * speedScale * scaleRatio;
            const distY = rawDist * direction;

            if (isHold) {
                const noteEndY = getLineYPos(line, note.endSec);
                const rawEndDist = (noteEndY - currentLineY) * note.speed * speedScale * scaleRatio;
                const yStart = distY; 
                const yEnd = rawEndDist * direction; 

                let effectiveYStart = yStart;
                let drawHead = true;

                if (time >= note.sec) {
                    effectiveYStart = 0; drawHead = false;    
                }

                let rectTop = Math.min(effectiveYStart, yEnd);
                let rectHeight = Math.abs(yEnd - effectiveYStart);

                ctx.save();
                ctx.globalAlpha = (note.alpha / 255) * 0.6;
                ctx.fillRect(distX - noteW/2, rectTop, noteW, rectHeight);
                ctx.restore();

                if (drawHead) {
                    ctx.fillRect(distX - noteW/2, yStart - noteH/2, noteW, noteH);
                    if (note.isMulti) {
                        ctx.save();
                        ctx.lineWidth = 3 * scaleRatio; ctx.strokeStyle = "#fff700"; 
                        ctx.globalAlpha = note.alpha / 255; ctx.strokeRect(distX - noteW/2, yStart - noteH/2, noteW, noteH);
                        ctx.restore();
                    }
                }
            } else {
                const rectX = distX - noteW/2;
                const rectY = distY - noteH/2;
                ctx.fillRect(rectX, rectY, noteW, noteH);
                if (note.isMulti) {
                    ctx.save();
                    ctx.lineWidth = 3 * scaleRatio; ctx.strokeStyle = "#fff700"; 
                    ctx.globalAlpha = note.alpha / 255; ctx.strokeRect(rectX, rectY, noteW, noteH);
                    ctx.restore();
                }
            }
        });
        ctx.globalAlpha = 1.0;
        ctx.restore();
    });

    ctx.save();
    hitEffects = hitEffects.filter(effect => effect.draw(ctx));
    ctx.restore();
    drawUI(time);
}

// **修改：UI 繪製邏輯**
function drawUI(currentTime) {
    ctx.save();
    
    // 進度條 (保持原樣，不隨 uiScale 縮放)
    if (audioBuffer) {
        const safeTime = Math.max(0, Math.min(currentTime, audioBuffer.duration));
        const progress = safeTime / audioBuffer.duration;
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fillRect(0, 0, canvas.width, 6 * scaleRatio);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width * progress, 6 * scaleRatio);
    }

    // *** 應用 UI 縮放倍率 ***
    const margin = 20 * scaleRatio * uiScaleMultiplier;

    // Combo
    if (combo > 0) {
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        
        // 放大字體
        const comboFontSize = 60 * scaleRatio * uiScaleMultiplier;
        const subFontSize = 20 * scaleRatio * uiScaleMultiplier;
        const comboY = 80 * scaleRatio * uiScaleMultiplier;
        const subY = 110 * scaleRatio * uiScaleMultiplier;

        ctx.font = `bold ${comboFontSize}px Arial`;
        ctx.fillText(combo, canvas.width / 2, comboY);
        
        ctx.font = `${subFontSize}px Arial`;
        ctx.fillStyle = "#aaa";
        const comboText = comboTextInput.value || 'COMBO';
        ctx.fillText(comboText, canvas.width / 2, subY);
    }

    // Score (右上方)
    let score = 0;
    if (totalNotes > 0) {
        score = Math.floor((combo / totalNotes) * 1000000);
    }
    const scoreStr = score.toString().padStart(7, '0');
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    const scoreFontSize = 40 * scaleRatio * uiScaleMultiplier;
    // 位置也要跟著字體大小移動一點，避免貼邊
    ctx.font = `bold ${scoreFontSize}px Consolas, monospace`;
    // 使用 scaled margin
    ctx.fillText(scoreStr, canvas.width - margin, 50 * scaleRatio * uiScaleMultiplier);

    // Song Name (左下角)
    const songTitle = songNameInput.value || "Untitled";
    ctx.textAlign = "left";
    const titleFontSize = 30 * scaleRatio * uiScaleMultiplier;
    ctx.font = `bold ${titleFontSize}px Arial`;
    ctx.fillText(songTitle, margin, canvas.height - margin);

    // Difficulty (右下角)
    const difficultyStr = difficultyInput.value || "IN Lv.15";
    ctx.textAlign = "right";
    // 難度字體稍微小一點
    const diffFontSize = 30 * scaleRatio * uiScaleMultiplier; 
    ctx.font = `bold ${diffFontSize}px Arial`; 
    ctx.fillText(difficultyStr, canvas.width - margin, canvas.height - margin);

    ctx.restore();
}