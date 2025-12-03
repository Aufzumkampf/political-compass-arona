let DB = null;
let currentCategoryIndex = 0;
let categories = [];
let availableQuestions = {}; 
let answeredCounts = {};
let scores = {};
let maxScores = {}; // 记录理论上可能达到的最大绝对值，用于百分比计算

// 初始化
window.onload = async () => {
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error("无法读取 data.json");
        DB = await res.json();
        
        // 激活开始按钮
        const btn = document.getElementById('start-btn');
        btn.disabled = false;
        btn.innerText = "开始测试 Mission Start!";
        document.getElementById('loading-msg').style.display = 'none';
        
        initGame();
    } catch (e) {
        alert("错误：无法加载数据文件。\n请确保 data.json 存在且格式正确。\n请使用本地服务器 (localhost) 运行。");
        console.error(e);
        document.getElementById('loading-msg').innerText = "加载失败: " + e.message;
    }
};

function initGame() {
    categories = DB.meta.question_logic.categories;
    
    // 1. 准备题库：复制并打乱
    categories.forEach(cat => {
        if(DB.questions[cat]) {
            availableQuestions[cat] = [...DB.questions[cat]];
            availableQuestions[cat].sort(() => Math.random() - 0.5);
        } else {
            console.warn(`分类 ${cat} 在 questions 中不存在`);
            availableQuestions[cat] = [];
        }
        answeredCounts[cat] = 0;
    });
    
    // 2. 重置分数
    for (let axis in DB.meta.axes) {
        scores[axis] = 0;
        maxScores[axis] = 0;
    }
}

function showScreen(id) {
    document.querySelectorAll('.card').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    window.scrollTo(0, 0);
}

function startTest() {
    initGame(); // 确保每次开始都是新的状态
    showScreen('quiz-screen');
    loadNextQuestion();
}

// 核心逻辑：轮询分类发牌
function loadNextQuestion() {
    // 检查是否所有分类的题目都取完了
    const allDone = categories.every(cat => availableQuestions[cat].length === 0);
    if (allDone) {
        finishTest();
        return;
    }

    // 寻找下一个有题目的分类
    let attempts = 0;
    let category = categories[currentCategoryIndex];
    
    while (availableQuestions[category].length === 0 && attempts < categories.length) {
        currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
        category = categories[currentCategoryIndex];
        attempts++;
    }

    // 双重保险
    if (attempts >= categories.length || availableQuestions[category].length === 0) {
        finishTest();
        return;
    }

    // 取出一道题
    const question = availableQuestions[category].pop();
    renderQuestion(question, category);
    
    // 指向下一个分类
    currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
}

function renderQuestion(question, category) {
    // 分类名称映射（美化显示）
    const catMap = {
        "economy": "💰 经济", "diplomacy": "🌏 外交", 
        "governance": "🏛️ 政治", "culture": "🎭 社会", 
        "environment": "🌲 环境"
    };
    
    document.getElementById('q-category').innerText = catMap[category] || category;
    document.getElementById('q-category').className = `category-badge cat-${category}`; // 用于CSS配色
    document.getElementById('question-text').innerText = question.text;
    
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    question.options.forEach((opt) => {
        const btn = document.createElement('div');
        btn.className = 'option-card';
        btn.innerText = opt.text;
        // 绑定点击事件
        btn.onclick = () => handleAnswer(opt.effects, category);
        container.appendChild(btn);
    });
    
    updateProgress();
    checkSkipCondition();
}

function handleAnswer(effects, category) {
    // 计分逻辑
    for (let axis in effects) {
        // 只有在 meta.axes 中定义的维度才计入总分
        if (DB.meta.axes.hasOwnProperty(axis)) {
            const val = effects[axis];
            scores[axis] += val;
            maxScores[axis] += Math.abs(val); // 累加绝对值，用于计算百分比位置
        }
    }
    
    answeredCounts[category]++;
    
    // 为了视觉流畅，稍微延迟一点翻页
    setTimeout(() => {
        loadNextQuestion();
    }, 150);
}

function checkSkipCondition() {
    const threshold = DB.meta.question_logic.questions_per_category_before_skip;
    // 检查是否所有分类都至少回答了 N 道题
    const canSkip = categories.every(cat => answeredCounts[cat] >= threshold);
    
    const btn = document.getElementById('btn-finish-early');
    if (canSkip) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

function updateProgress() {
    const totalAnswered = Object.values(answeredCounts).reduce((a,b)=>a+b, 0);
    // 估算总题数 (5个分类 * 每个分类大概10题)
    const estimatedTotal = 50; 
    document.getElementById('q-progress').innerText = totalAnswered;
    
    const pct = Math.min(100, (totalAnswered / estimatedTotal) * 100);
    document.getElementById('progress-bar').style.width = `${pct}%`;
}

function finishTest() {
    showScreen('result-screen');
    calculateResults();
}

// 全局变量存储 Top 3，用于弹窗
let topMatches = [];

function calculateResults() {
    // 1. 归一化用户分数 (-100 到 100)
    // 无论用户做了多少题，都将其映射到 -100 ~ 100 的坐标系上
    let userStats = {};
    
    for (let axis in DB.meta.axes) {
        let raw = scores[axis];
        let max = maxScores[axis];
        
        // 防止除以0
        if (max === 0) max = 1;
        
        // 计算百分比位置 (-1 到 1)
        let ratio = raw / max;
        
        // 映射到 -100 到 100
        userStats[axis] = ratio * 100;
    }
    
    // 渲染维度条
    renderAxesCharts(userStats);

    // 2. 匹配阵营 (欧氏距离)
    let matches = [];
    DB.ideologies.forEach(ideo => {
        let dist = 0;
        let dimensionsCount = 0;
        
        for (let axis in ideo.stats) {
            // 只比较双方都存在的维度
            if (userStats[axis] !== undefined) {
                let diff = userStats[axis] - ideo.stats[axis];
                dist += Math.pow(diff, 2);
                dimensionsCount++;
            }
        }
        
        if (dimensionsCount > 0) {
            // 标准化距离，防止维度缺失导致误差
            let finalDist = Math.sqrt(dist);
            matches.push({ ...ideo, dist: finalDist });
        }
    });

    // 排序：距离越小越匹配
    matches.sort((a, b) => a.dist - b.dist);
    topMatches = matches.slice(0, 3); // 取前三

    // 渲染匹配结果
    const container = document.getElementById('top-matches-container');
    container.innerHTML = '';
    
    topMatches.forEach((m, idx) => {
        // 计算匹配度 (简单反转算法: 距离0为100%，距离200(最大理论值)为0%)
        // 实际上5维空间最大距离约为 200 * sqrt(5) ≈ 447
        // 为了让数值好看一点，我们用一个经验公式
        let matchPct = Math.max(0, 100 - (m.dist / 2.5)); 

        const rankClass = idx === 0 ? 'rank-gold' : (idx === 1 ? 'rank-silver' : 'rank-bronze');
        const icon = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');

        container.innerHTML += `
            <div class="match-card ${rankClass}" onclick="showDetail(${idx})">
                <div class="match-left">
                    <span class="match-icon">${icon}</span>
                    <div class="match-info">
                        <h3>${m.name}</h3>
                        <span class="view-detail">点击查看详情 &raquo;</span>
                    </div>
                </div>
                <div class="match-right">
                    <span class="match-pct">${matchPct.toFixed(0)}%</span>
                    <span class="match-label">匹配度</span>
                </div>
            </div>
        `;
    });
}

function renderAxesCharts(userStats) {
    const container = document.getElementById('axes-results');
    container.innerHTML = '';
    
    for(let axis in DB.meta.axes) {
        const meta = DB.meta.axes[axis];
        const val = userStats[axis]; // -100 ~ 100
        
        // 转换 CSS 宽度 (0% ~ 100%)
        // -100 => 0%, 0 => 50%, 100 => 100%
        const pctRight = (val + 100) / 2;
        const pctLeft = 100 - pctRight;
        
        container.innerHTML += `
            <div class="axis-row">
                <div class="axis-header">
                    <span>${meta.left}</span>
                    <span class="axis-name">${meta.name}</span>
                    <span>${meta.right}</span>
                </div>
                <div class="axis-bar-bg">
                    <div class="axis-bar-left" style="width: ${pctLeft}%"></div>
                    <div class="axis-bar-right" style="width: ${pctRight}%"></div>
                    <div class="axis-marker" style="left: ${pctRight}%"></div>
                </div>
            </div>
        `;
    }
}

// 弹窗逻辑
function showDetail(idx) {
    const data = topMatches[idx];
    document.getElementById('modal-title').innerText = data.name;
    document.getElementById('modal-desc').innerText = data.desc;
    
    // 渲染人物 (数组 -> 标签)
    const figuresDiv = document.getElementById('modal-figures');
    if (Array.isArray(data.figures)) {
        figuresDiv.innerHTML = data.figures.map(f => `<span class="figure-tag">${f}</span>`).join('');
    } else {
        figuresDiv.innerHTML = data.figures || "无数据";
    }

    // 渲染名言 (对象)
    const quoteBox = document.getElementById('modal-quote');
    if(data.quote) {
        quoteBox.innerHTML = `
            <p class="quote-text">“${data.quote.text}”</p>
            <p class="quote-author">—— ${data.quote.author}</p>
        `;
    } else {
        quoteBox.innerHTML = "";
    }

    // 渲染书籍 (数组 -> 列表)
    const bookList = document.getElementById('modal-books');
    if (Array.isArray(data.books)) {
        bookList.innerHTML = data.books.map(b => `<li>${b}</li>`).join('');
    } else {
        bookList.innerHTML = "<li>暂无推荐</li>";
    }

    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetail() {
    document.getElementById('detail-modal').classList.add('hidden');
}

// 点击遮罩关闭
window.onclick = function(e) {
    if(e.target == document.getElementById('detail-modal')) closeDetail();
}