require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs' }});

let editor;
let pyodide;

// 預設設定
const appSettings = {
    fontSize: 14,
    wordWrap: 'off',
    minimap: true,
    lineNumbers: true
};

// 檔案系統
const files = {};
let openTabFiles = [];
let activeFileName = null;

require(['vs/editor/editor.main'], function() {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: appSettings.fontSize,
        minimap: { enabled: appSettings.minimap },
        wordWrap: appSettings.wordWrap,
        lineNumbers: appSettings.lineNumbers ? 'on' : 'off',
        scrollBeyondLastLine: false,
        renderLineHighlight: 'all',
        model: null
    });

    editor.onDidChangeCursorPosition((e) => {
        const position = e.position;
        document.getElementById('cursor-position').innerText = `Ln ${position.lineNumber}, Col ${position.column}`;
    });

    // 預設檔案
    createFile('main.py', '# Web Python Editor v1.0\nprint("Hello World")');
    openFile('main.py');
});

// --- Menu Bar Actions (統一處理函式) ---
window.triggerAction = function(action) {
    if (!editor) return;

    switch(action) {
        case 'new-file':
            document.getElementById('btn-new-file').click();
            break;
        case 'import':
            document.getElementById('btn-import').click();
            break;
        case 'save':
            document.getElementById('btn-export').click();
            break;
        case 'undo':
            editor.trigger('source', 'undo');
            break;
        case 'redo':
            editor.trigger('source', 'redo');
            break;
        case 'select-all':
            editor.trigger('source', 'selectAll');
            break;
        case 'toggle-sidebar':
            document.getElementById('toggle-sidebar-btn').click();
            break;
        case 'toggle-minimap':
            // 切換並更新 UI 和設定
            appSettings.minimap = !appSettings.minimap;
            document.getElementById('setting-minimap').checked = appSettings.minimap;
            applySettings();
            break;
        case 'toggle-wordwrap':
            appSettings.wordWrap = appSettings.wordWrap === 'on' ? 'off' : 'on';
            document.getElementById('setting-word-wrap').checked = (appSettings.wordWrap === 'on');
            applySettings();
            break;
        case 'run':
            document.getElementById('run-btn').click();
            break;
    }
};

// --- Settings Logic (設定頁面邏輯) ---

// 1. 開啟設定視窗
document.getElementById('btn-settings').addEventListener('click', () => {
    // 同步當前值到輸入框
    document.getElementById('setting-font-size').value = appSettings.fontSize;
    document.getElementById('setting-word-wrap').checked = (appSettings.wordWrap === 'on');
    document.getElementById('setting-minimap').checked = appSettings.minimap;
    document.getElementById('setting-line-numbers').checked = appSettings.lineNumbers;
    
    document.getElementById('settings-overlay').classList.remove('hidden');
});

// 2. 關閉設定視窗
document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-overlay').classList.add('hidden');
});

// 點擊遮罩層也可關閉
document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'settings-overlay') {
        document.getElementById('settings-overlay').classList.add('hidden');
    }
});

// 3. 監聽設定變更 (即時應用)
document.getElementById('setting-font-size').addEventListener('change', (e) => {
    appSettings.fontSize = parseInt(e.target.value);
    applySettings();
});

document.getElementById('setting-word-wrap').addEventListener('change', (e) => {
    appSettings.wordWrap = e.target.checked ? 'on' : 'off';
    applySettings();
});

document.getElementById('setting-minimap').addEventListener('change', (e) => {
    appSettings.minimap = e.target.checked;
    applySettings();
});

document.getElementById('setting-line-numbers').addEventListener('change', (e) => {
    appSettings.lineNumbers = e.target.checked;
    applySettings();
});

// 4. 應用設定到 Monaco Editor
function applySettings() {
    if (!editor) return;
    editor.updateOptions({
        fontSize: appSettings.fontSize,
        wordWrap: appSettings.wordWrap,
        minimap: { enabled: appSettings.minimap },
        lineNumbers: appSettings.lineNumbers ? 'on' : 'off'
    });
    // 更新狀態列字體顯示
    document.getElementById('font-size-display').innerText = `${appSettings.fontSize}px`;
}


// --- 以下為舊有的檔案系統邏輯 (保持不變) ---

function createFile(name, content = "") {
    if (files[name]) { alert("File exists!"); return; }
    const model = monaco.editor.createModel(content, getLanguageFromExt(name));
    files[name] = model;
    if (!openTabFiles.includes(name)) openTabFiles.push(name);
    renderSidebar();
    openFile(name);
}

function getLanguageFromExt(filename) {
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.html')) return 'html';
    if (filename.endsWith('.json')) return 'json';
    return 'plaintext';
}

function openFile(name) {
    if (!files[name]) return;
    activeFileName = name;
    if (!openTabFiles.includes(name)) openTabFiles.push(name);
    editor.setModel(files[name]);
    renderTabs();
    renderSidebar();
}

function closeTab(name, event) {
    if(event) event.stopPropagation();
    openTabFiles = openTabFiles.filter(f => f !== name);
    if (activeFileName === name) {
        if (openTabFiles.length > 0) openFile(openTabFiles[openTabFiles.length - 1]);
        else { activeFileName = null; editor.setModel(null); renderTabs(); renderSidebar(); }
    } else renderTabs();
}

function renderSidebar() {
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    Object.keys(files).forEach(name => {
        const div = document.createElement('div');
        div.className = `file-item ${name === activeFileName ? 'active' : ''}`;
        div.onclick = () => openFile(name);
        div.innerHTML = `<img src="${getFileIcon(name)}" class="file-icon"><span>${name}</span>`;
        list.appendChild(div);
    });
}

function renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';
    openTabFiles.forEach(name => {
        const div = document.createElement('div');
        div.className = `tab ${name === activeFileName ? 'active' : ''}`;
        div.onclick = () => openFile(name);
        div.innerHTML = `<img src="${getFileIcon(name)}" class="file-icon"><span class="tab-name">${name}</span><i class="codicon codicon-close close-tab"></i>`;
        div.querySelector('.close-tab').onclick = (e) => closeTab(name, e);
        container.appendChild(div);
    });
}

function getFileIcon(name) {
    if (name.endsWith('.py')) return 'https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg';
    return 'https://raw.githubusercontent.com/devicons/devicon/master/icons/code/code-original.svg';
}

// Rename, Delete, Import, Export handlers...
document.getElementById('btn-new-file').addEventListener('click', () => {
    const name = prompt("Filename:", "script.py"); if (name) createFile(name);
});
document.getElementById('btn-rename-file').addEventListener('click', () => {
    if(!activeFileName) return;
    const newName = prompt("New name:", activeFileName);
    if(newName && !files[newName]) {
        if(pyodide && pyodide.FS) try{pyodide.FS.unlink(activeFileName)}catch(e){}
        files[newName] = files[activeFileName]; delete files[activeFileName];
        monaco.editor.setModelLanguage(files[newName], getLanguageFromExt(newName));
        openTabFiles[openTabFiles.indexOf(activeFileName)] = newName;
        activeFileName = newName; renderSidebar(); renderTabs();
    }
});
document.getElementById('btn-delete-file').addEventListener('click', () => {
    if(activeFileName && confirm('Delete?')) {
        files[activeFileName].dispose(); delete files[activeFileName];
        closeTab(activeFileName); renderSidebar();
    }
});
document.getElementById('btn-export').addEventListener('click', () => {
    if(!activeFileName) return;
    const blob = new Blob([files[activeFileName].getValue()], {type:'text/plain'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=activeFileName; a.click();
});
document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-input').click());
document.getElementById('file-input').addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(f => {
        const r = new FileReader(); r.onload=ev=>createFile(f.name, ev.target.result); r.readAsText(f);
    }); e.target.value='';
});

// Sidebar toggle
document.getElementById('toggle-sidebar-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('hidden');
    setTimeout(() => editor && editor.layout(), 110);
});

// Run Code
async function main() {
    const output = document.getElementById('terminal-output');
    try { pyodide = await loadPyodide(); output.innerText = "Python Ready.\n"; } 
    catch(e) { output.innerText = "Err: "+e.message; }
}
main();

document.getElementById('run-btn').addEventListener('click', async () => {
    const output = document.getElementById('terminal-output');
    if(!pyodide || !activeFileName) return;
    output.innerText += `> python ${activeFileName}\n`;
    try {
        Object.keys(files).forEach(f => pyodide.FS.writeFile(f, files[f].getValue()));
        pyodide.setStdout({batched: m => {output.innerText+=m+"\n"; output.scrollTop=output.scrollHeight;}});
        await pyodide.runPythonAsync(files[activeFileName].getValue());
    } catch(e) { output.innerHTML+=`<span style="color:#f14c4c">${e.message}</span>\n`; }
});

document.getElementById('clear-btn').addEventListener('click', () => document.getElementById('terminal-output').innerText="");
document.getElementById('restart-btn').addEventListener('click', () => document.getElementById('terminal-output').innerText="Restarted.\n");