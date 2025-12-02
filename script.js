let DB = null;
let currentQuestionIndex = 0;
let userAnswers = []; // 存储用户的选择 (用于撤销)
let scores = {};
let maxScores = {};
let mode = 'basic'; // 'basic' or 'extended'
const BASIC_LIMIT = 100;
const EXTENDED_LIMIT = 150;

// 初始化
window.onload = async () => {
    try {
        const response = await fetch('data.json');
        DB = await response.json();
        initScores();
    } catch (e) {
        alert("⚠️ 无法加载 data.json。请确保文件存在且通过服务器访问（GitHub Pages 没问题，本地直接打开可能会有跨域错误）。");
        console.error(e);
    }
};

function initScores() {
    for (let axis in DB.meta.axes) {
        scores[axis] = 0.0;
        maxScores[axis] = 0.0;
    }
}

// 页面切换辅助函数
function showScreen(screenId) {
    ['start-screen', 'quiz-screen', 'inter-screen', 'result-screen'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

// 开始测试
function startTest() {
    showScreen('quiz-screen');
    loadQuestion();
}

// 加载题目
function loadQuestion() {
    const q = DB.questions[currentQuestionIndex];
    document.getElementById('question-text').innerText = `${currentQuestionIndex + 1}. ${q.text}`;
    
    // 更新进度条
    const total = mode === 'basic' ? BASIC_LIMIT : EXTENDED_LIMIT;
    document.getElementById('q-progress').innerText = currentQuestionIndex + 1;
    document.getElementById('q-total').innerText = total;
    const percent = ((currentQuestionIndex) / total) * 100;
    document.getElementById('progress-bar').style.width = `${percent}%`;

    // 撤销按钮状态
    document.getElementById('btn-undo').disabled = currentQuestionIndex === 0;
}

// 处理回答
function answer(choice) {
    const weight = DB.meta.options_map[choice].weight;
    const q = DB.questions[currentQuestionIndex];
    
    // 记录答案以便计分和撤销
    userAnswers.push({
        axis: q.axis,
        effect: q.effect,
        weight: weight
    });

    // 实时计分
    scores[q.axis] += q.effect * weight;
    maxScores[q.axis] += Math.abs(q.effect);

    currentQuestionIndex++;

    // 检查节点
    if (currentQuestionIndex === BASIC_LIMIT && mode === 'basic') {
        showScreen('inter-screen');
    } else if (currentQuestionIndex === EXTENDED_LIMIT) {
        finishTest();
    } else {
        loadQuestion();
    }
}

// 撤销上一题
function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        const lastAns = userAnswers.pop();
        // 回滚分数
        scores[lastAns.axis] -= lastAns.effect * lastAns.weight;
        maxScores[lastAns.axis] -= Math.abs(lastAns.effect);
        loadQuestion();
    }
}

// 进入扩展模式
function enterExtendedMode() {
    mode = 'extended';
    alert("⚡ 已进入【深水区】。请做好准备！");
    showScreen('quiz-screen');
    loadQuestion();
}

// 结束并计算结果
function finishTest() {
    showScreen('result-screen');
    renderResults();
}

// 渲染结果 (包含修正后的逻辑)
function renderResults() {
    const axesMeta = DB.meta.axes;
    const userStats = {};
    const resultsContainer = document.getElementById('axes-results');
    resultsContainer.innerHTML = '';
    
    let hasExtremeViews = false;

    // 1. 计算各维度百分比并渲染条形图
    for (let axis in axesMeta) {
        const info = axesMeta[axis];
        const current = scores[axis];
        let maximum = maxScores[axis];
        if (maximum === 0) maximum = 1;

        // 归一化 (0-100)
        // 原始逻辑：effect * weight (-10 到 10)
        // (current / max + 1) / 2
        
        const ratio = (current / maximum + 1) / 2;
        let percent = ratio * 100;
        percent = Math.max(0, Math.min(100, percent));
        userStats[axis] = percent;

        // 拒绝平庸检测
        if (percent > 60 || percent < 40) {
            hasExtremeViews = true;
        }

        // 确定倾向文案
        let tendency = "中立";
        if (percent < 40) tendency = `倾向 ${info.left}`;
        if (percent < 15) tendency = `极端 ${info.left}`;
        if (percent > 60) tendency = `倾向 ${info.right}`;
        if (percent > 85) tendency = `极端 ${info.right}`;

        // 渲染 HTML
        const html = `
            <div class="axis-container">
                <div class="axis-title">
                    <span>${info.name}</span>
                    <span>${tendency} (${percent.toFixed(1)}%)</span>
                </div>
                <div class="bar-wrapper">
                    <div class="bar-left" style="width: ${100 - percent}%"></div>
                    <div class="bar-right" style="width: ${percent}%"></div>
                </div>
                <div class="axis-labels">
                    <span>${info.left}</span>
                    <span>${info.right}</span>
                </div>
            </div>
        `;
        resultsContainer.insertAdjacentHTML('beforeend', html);
    }

    // 2. 匹配意识形态 (欧几里得距离)
    let bestMatch = null;
    let minDist = Infinity;

    for (let ideology of DB.ideologies) {
        // 屏蔽中间派黑洞
        if (hasExtremeViews && (ideology.name.includes("中间派") || ideology.name.includes("政治冷感"))) {
            continue;
        }

        let dist = 0;
        let validCount = 0;

        for (let axis in axesMeta) {
            if (ideology.stats[axis] !== undefined) {
                const diff = userStats[axis] - ideology.stats[axis];
                dist += Math.pow(diff, 2);
                validCount++;
            }
        }

        if (validCount > 0) {
            dist = Math.sqrt(dist);
            if (dist < minDist) {
                minDist = dist;
                bestMatch = ideology;
            }
        }
    }

    // 兜底
    if (!bestMatch) {
        bestMatch = DB.ideologies.find(i => i.name.includes("中间派"));
    }

    // 3. 渲染阵营详情
    document.getElementById('ideology-name').innerText = bestMatch.name;
    document.getElementById('ideology-desc').innerText = bestMatch.desc;

    // 名言
    const quoteBox = document.getElementById('ideology-quote');
    if (bestMatch.quote) {
        quoteBox.classList.remove('hidden');
        quoteBox.innerHTML = `“${bestMatch.quote.text}”<br><br><small>— ${bestMatch.quote.author} (${bestMatch.quote.trans})</small>`;
    } else {
        quoteBox.classList.add('hidden');
    }

    // 书单
    const bookBox = document.getElementById('book-rec');
    const bookList = document.getElementById('book-list');
    if (bestMatch.books && bestMatch.books.length > 0) {
        bookBox.classList.remove('hidden');
        bookList.innerHTML = bestMatch.books.map(b => `<li>${b}</li>`).join('');
    } else {
        bookBox.classList.add('hidden');
    }
}