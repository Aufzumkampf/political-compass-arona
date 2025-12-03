let DB = null;
let currentCategoryIndex = 0; // 当前轮询到的分类索引
let categories = []; // 分类列表
let availableQuestions = {}; // { 'econ': [Q1, Q2...], 'dipl': [...] }
let answeredCounts = {}; // { 'econ': 0, 'dipl': 0 ... }
let userAnswers = [];
let scores = {};
let maxScores = {};

// 初始化
window.onload = async () => {
    try {
        const res = await fetch('data.json');
        DB = await res.json();
        initGame();
    } catch (e) {
        alert("请在本地服务器环境下运行！");
        console.error(e);
    }
};

function initGame() {
    categories = DB.meta.question_logic.categories;
    // 初始化状态
    categories.forEach(cat => {
        availableQuestions[cat] = [...DB.questions[cat]]; // 复制题目数组
        // 打乱题目顺序
        availableQuestions[cat].sort(() => Math.random() - 0.5);
        answeredCounts[cat] = 0;
    });
    
    // 初始化分数
    for (let axis in DB.meta.axes) {
        scores[axis] = 0;
        maxScores[axis] = 0;
    }
}

function startTest() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    loadNextQuestion();
}

// 核心逻辑：轮询获取下一题
function loadNextQuestion() {
    // 检查是否所有题目都做完了
    const allDone = categories.every(cat => availableQuestions[cat].length === 0);
    if (allDone) {
        finishTest();
        return;
    }

    // 轮询寻找有题目的分类
    let attempts = 0;
    let category = categories[currentCategoryIndex];
    
    while (availableQuestions[category].length === 0 && attempts < categories.length) {
        currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
        category = categories[currentCategoryIndex];
        attempts++;
    }

    if (attempts >= categories.length) {
        finishTest();
        return;
    }

    // 取出题目
    const question = availableQuestions[category].pop();
    currentQuestionObj = { q: question, cat: category }; // 暂存当前题目对象
    
    renderQuestion(question, category);
    
    // 指向下一个分类，为下一轮做准备
    currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
}

function renderQuestion(question, category) {
    // 映射中文分类名
    const catMap = {
        "economy": "💰 经济", "diplomacy": "🌏 外交", 
        "governance": "🏛️ 政治", "culture": "🎭 文化", 
        "environment": "🌲 环境"
    };
    
    document.getElementById('q-category').innerText = catMap[category] || category;
    document.getElementById('question-text').innerText = question.text;
    
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    question.options.forEach((opt) => {
        const btn = document.createElement('div'); // 改用div做卡片
        btn.className = 'option-card';
        btn.innerText = opt.text;
        btn.onclick = () => handleAnswer(opt.effects, category);
        container.appendChild(btn);
    });
    
    updateProgress();
    checkSkipCondition();
}

function handleAnswer(effects, category) {
    // 计分
    for (let axis in effects) {
        if (scores.hasOwnProperty(axis) || axis === 'jus') { // 兼容 data.json 里可能有 jus 但 meta 没写的情况
            scores[axis] = (scores[axis] || 0) + effects[axis];
            // 注意：因为 effects 复杂，这里 maxScores 简化处理，或者累加绝对值
             maxScores[axis] = (maxScores[axis] || 0) + Math.abs(effects[axis]);
        }
    }
    
    answeredCounts[category]++;
    userAnswers.push({ effects, category }); // 用于回退（虽然本版未实现回退UI，但逻辑保留）
    
    loadNextQuestion();
}

function checkSkipCondition() {
    const threshold = DB.meta.question_logic.questions_per_category_before_skip;
    // 检查是否每个分类都至少回答了 threshold 题
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
    // 估算总数：只是个展示
    document.getElementById('q-progress').innerText = totalAnswered;
}

function finishTest() {
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    
    // 计算匹配度
    calculateResults();
}

function calculateResults() {
    // 1. 归一化用户分数 (-100 到 100)
    let userStats = {};
    for (let axis in DB.meta.axes) {
        let raw = scores[axis] || 0;
        let max = maxScores[axis] || 1; 
        // 简单映射：假设 max 可能达到的分值，转为百分比
        // 这里简化算法：直接用 raw 值做相对比较
        userStats[axis] = raw; 
    }
    
    // 2. 寻找最近的 Ideology (欧氏距离)
    let bestMatch = null;
    let minDiff = Infinity;
    
    DB.ideologies.forEach(ideo => {
        let diff = 0;
        for (let axis in userStats) {
            // 注意：data.json 里的 ideology stats 范围是 -100 到 100 还是什么？
            // 假设 ideology stats 也是相对值。我们需要调整算法。
            // 这是一个演示，简化为直接比较数值差异
            // 实际项目中需要更严谨的归一化
            let ideoVal = ideo.stats[axis] || 0;
            let userVal = userStats[axis] * 5; // 放大系数，因为题目effect通常是-5~5，做30题大约积累到+/-30~50左右，而stats是+/-100
            diff += Math.pow(userVal - ideoVal, 2);
        }
        
        if (diff < minDiff) {
            minDiff = diff;
            bestMatch = ideo;
        }
    });
    
    if (bestMatch) {
        document.getElementById('result-name').innerText = bestMatch.name;
        document.getElementById('result-desc').innerText = bestMatch.desc;
    }
}