/* ============================================================
   더박스 스터디 — Vanilla JS app
   - Card grid + 검색/카테고리 필터
   - 상세 패널 (모달, hash routing)
   - 톤/한국어 토글, 다크모드, TTS
   ============================================================ */
(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 카테고리 메타 (이모지 + 표시 순서)
  // ──────────────────────────────────────────────────────────
  const CAT_META = {
    MONEY:      { emoji: '💰', label: 'MONEY' },
    CAREER:     { emoji: '💼', label: 'CAREER' },
    LOVE:       { emoji: '💕', label: 'LOVE' },
    FAMILY:     { emoji: '👨‍👩‍👧', label: 'FAMILY' },
    TRAVEL:     { emoji: '✈️', label: 'TRAVEL' },
    AI:         { emoji: '🤖', label: 'AI' },
    FRIENDSHIP: { emoji: '🤝', label: 'FRIENDSHIP' },
    FOOD:       { emoji: '🍱', label: 'FOOD' },
    SNS:        { emoji: '📱', label: 'SNS' },
    WORK:       { emoji: '🧑‍💻', label: 'WORK' },
    HEALTH:     { emoji: '💪', label: 'HEALTH' },
    LIFESTYLE:  { emoji: '🌿', label: 'LIFESTYLE' },
    OTHER:      { emoji: '📚', label: 'OTHER' },
  };

  const SECTION_META = {
    small_talk:      { num: '01', label: 'SMALL TALK',         icon: '👋' },
    pop_quiz:        { num: '02', label: 'POP QUIZ',           icon: '🔍' },
    warm_up:         { num: '03', label: 'WARM-UP',            icon: '🎯' },
    warm_up_v2:      { num: '03', label: 'WARM-UP',            icon: '🎯' },
    background:      { num: '04', label: 'BACKGROUND',         icon: '🇰🇷' },
    read:            { num: '05', label: 'READ BEFORE WE TALK', icon: '📖' },
    discussion_flow: { num: '06', label: 'DISCUSSION FLOW',    icon: '🗣' },
    easy_entry:      { num: '06', label: 'EASY ENTRY',         icon: '⚡' },
    main_discussion: { num: '07', label: 'MAIN DISCUSSION',    icon: '🗣' },
    keep_talking:    { num: '07', label: 'KEEP TALKING',       icon: '💬' },
    words:           { num: '08', label: 'WORDS YOU MIGHT NEED', icon: '💡' },
    try_phrases:     { num: '09', label: 'TRY THESE PHRASES',  icon: '🗯' },
    closing:         { num: '09', label: 'CLOSING TASK',       icon: '✍️' },
    final_line:      { num: '✍', label: 'MY FINAL LINE',       icon: '✍️' },
  };

  // ──────────────────────────────────────────────────────────
  // 상태
  // ──────────────────────────────────────────────────────────
  const state = {
    topics: [],
    filtered: [],
    activeCategory: 'ALL',
    searchQuery: '',
    currentTopicId: null,
    options: loadOptions(),
  };

  function loadOptions() {
    try {
      const saved = JSON.parse(localStorage.getItem('thebox-options') || '{}');
      return {
        theme: saved.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
        showKo: saved.showKo !== false,
        showPro: saved.showPro !== false,
        showCon: saved.showCon !== false,
        showNeutral: saved.showNeutral !== false,
        ttsRate: saved.ttsRate || 0.95,
      };
    } catch {
      return {
        theme: 'light', showKo: true, showPro: true, showCon: true, showNeutral: true, ttsRate: 0.95,
      };
    }
  }

  function saveOptions() {
    try {
      localStorage.setItem('thebox-options', JSON.stringify(state.options));
    } catch {}
  }

  // ──────────────────────────────────────────────────────────
  // DOM helpers
  // ──────────────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'style') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach(c => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function catColor(cat) {
    return `var(--cat-${cat}, var(--cat-OTHER))`;
  }

  function getLessonCounts(topic) {
    const questionCount = topic.sections.reduce((sum, sec) => sum + ((sec.questions || []).length), 0);
    const wordCount = (topic.sections.find(sec => sec.type === 'words')?.items || []).length;
    const phraseCount = (topic.sections.find(sec => sec.type === 'try_phrases')?.items || []).length;
    return {
      sections: topic.sections.length,
      questions: questionCount,
      helpers: wordCount + phraseCount,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 초기 부팅
  // ──────────────────────────────────────────────────────────
  async function boot() {
    applyTheme(state.options.theme);
    bindHeaderEvents();
    bindDetailEvents();

    try {
      const res = await fetch('data/topics.json');
      if (!res.ok) throw new Error('topics.json load failed');
      state.topics = await res.json();
    } catch (e) {
      $('#grid').innerHTML = `<p class="loading">자료를 불러오지 못했어요. (${e.message})</p>`;
      return;
    }

    renderCategoryChips();
    applyFilters();

    // 해시로 진입한 경우 자동 상세 열기
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
  }

  function handleHashChange() {
    const hash = location.hash.replace('#', '');
    if (hash) {
      const id = hash.split('-')[0];
      const topic = state.topics.find(t => t.id === id);
      if (topic) {
        openDetail(topic);
        return;
      }
    }
    closeDetail();
  }

  // ──────────────────────────────────────────────────────────
  // Header / Filters
  // ──────────────────────────────────────────────────────────
  function bindHeaderEvents() {
    $('#theme-toggle').addEventListener('click', () => {
      state.options.theme = state.options.theme === 'dark' ? 'light' : 'dark';
      applyTheme(state.options.theme);
      saveOptions();
    });

    const search = $('#search');
    const clearBtn = $('#search-clear');
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.searchQuery = search.value.trim().toLowerCase();
        clearBtn.hidden = !state.searchQuery;
        applyFilters();
      }, 120);
    });
    clearBtn.addEventListener('click', () => {
      search.value = '';
      state.searchQuery = '';
      clearBtn.hidden = true;
      applyFilters();
      search.focus();
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function renderCategoryChips() {
    const counts = state.topics.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + 1;
      return acc;
    }, {});

    const ordered = Object.keys(CAT_META).filter(c => counts[c]);
    const container = $('#category-filters');
    container.innerHTML = '';

    const allChip = el('button', {
      class: 'cat-chip',
      dataset: { active: state.activeCategory === 'ALL' },
      onClick: () => setCategory('ALL'),
    }, `전체 ${state.topics.length}`);
    container.appendChild(allChip);

    ordered.forEach(cat => {
      const meta = CAT_META[cat];
      const chip = el('button', {
        class: 'cat-chip',
        dataset: { active: state.activeCategory === cat },
        style: { '--cat-color': `var(--cat-${cat})` },
        onClick: () => setCategory(cat),
      }, `${meta.emoji} ${meta.label} ${counts[cat]}`);
      container.appendChild(chip);
    });
  }

  function setCategory(cat) {
    state.activeCategory = cat;
    $$('#category-filters .cat-chip').forEach((c, i) => {
      const isAll = i === 0;
      const myCat = isAll ? 'ALL' : Object.keys(CAT_META).filter(k => state.topics.some(t => t.category === k))[i - 1];
      c.dataset.active = (myCat === cat);
    });
    applyFilters();
  }

  function applyFilters() {
    const q = state.searchQuery;
    state.filtered = state.topics.filter(t => {
      if (state.activeCategory !== 'ALL' && t.category !== state.activeCategory) return false;
      if (!q) return true;
      // 제목, 카테고리, 미리보기, slug 검색
      return (
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q)
      );
    });
    renderGrid();
  }

  // ──────────────────────────────────────────────────────────
  // Card grid
  // ──────────────────────────────────────────────────────────
  function renderGrid() {
    const grid = $('#grid');
    grid.innerHTML = '';
    const count = $('#result-count');

    if (state.filtered.length === 0) {
      grid.appendChild(el('div', { class: 'empty-state' },
        el('div', { class: 'empty-state-icon' }, '🔍'),
        el('p', {}, '검색 결과 없음'),
      ));
      count.textContent = '';
      return;
    }

    state.filtered.forEach(t => grid.appendChild(renderCard(t)));
    count.textContent = `${state.filtered.length} / ${state.topics.length} 주제`;
  }

  function renderCard(topic) {
    const meta = CAT_META[topic.category] || CAT_META.OTHER;
    const counts = getLessonCounts(topic);
    return el('button', {
      class: 'topic-card',
      onClick: () => {
        location.hash = `${topic.id}-${topic.slug}`;
      },
    },
      el('div', { class: 'card-top' },
        el('span', { class: 'id-badge' }, topic.id),
        el('span', {
          class: 'cat-badge',
          style: { '--cat-color': `var(--cat-${topic.category})` },
        }, `${meta.emoji} ${meta.label}`),
      ),
      el('h3', { class: 'card-title' }, topic.title),
      el('p', { class: 'card-preview' }, topic.preview),
      el('div', { class: 'card-metrics', 'aria-label': '수업 구성' },
        el('span', {}, `${counts.sections} steps`),
        el('span', {}, `${counts.questions} Qs`),
        el('span', {}, `${counts.helpers} helpers`),
      ),
    );
  }

  // ──────────────────────────────────────────────────────────
  // Detail panel
  // ──────────────────────────────────────────────────────────
  function bindDetailEvents() {
    $('#detail-close').addEventListener('click', () => {
      location.hash = '';
    });
    $('#backdrop').addEventListener('click', () => {
      location.hash = '';
    });
    $('#detail-menu-btn').addEventListener('click', toggleOptions);
    $('#ko-toggle').addEventListener('click', () => {
      state.options.showKo = !state.options.showKo;
      $('#ko-toggle').dataset.state = state.options.showKo ? 'on' : 'off';
      $('#ko-toggle').textContent = state.options.showKo ? '표시' : '숨김';
      applyDetailOptions();
      saveOptions();
    });
    $$('.tone-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tone = chip.dataset.tone;
        const key = `show${tone.charAt(0).toUpperCase() + tone.slice(1)}`;
        state.options[key] = !state.options[key];
        chip.dataset.state = state.options[key] ? 'on' : 'off';
        applyDetailOptions();
        saveOptions();
      });
    });
    $('#tts-rate').addEventListener('click', () => {
      const rates = [0.85, 0.95, 1.1];
      const labels = ['느리게', '보통', '빠르게'];
      const idx = (rates.indexOf(parseFloat(state.options.ttsRate)) + 1) % rates.length;
      state.options.ttsRate = rates[idx];
      $('#tts-rate').dataset.rate = rates[idx];
      $('#tts-rate').textContent = `속도 ${labels[idx]}`;
      saveOptions();
    });
    $('#prev-topic').addEventListener('click', () => navigateTopic(-1));
    $('#next-topic').addEventListener('click', () => navigateTopic(1));
    $('#detail').addEventListener('scroll', () => {
      window.requestAnimationFrame(updateActiveLessonStep);
    });

    document.addEventListener('keydown', (e) => {
      if ($('#detail').hidden) return;
      if (e.key === 'Escape') location.hash = '';
      if (e.key === 'ArrowLeft') navigateTopic(-1);
      if (e.key === 'ArrowRight') navigateTopic(1);
    });
  }

  function toggleOptions() {
    const panel = $('#detail-options');
    panel.hidden = !panel.hidden;
    $('#detail-menu-btn').setAttribute('aria-expanded', !panel.hidden);
  }

  function navigateTopic(dir) {
    if (!state.currentTopicId) return;
    const idx = state.topics.findIndex(t => t.id === state.currentTopicId);
    const next = state.topics[idx + dir];
    if (next) location.hash = `${next.id}-${next.slug}`;
  }

  function openDetail(topic) {
    state.currentTopicId = topic.id;
    const meta = CAT_META[topic.category] || CAT_META.OTHER;

    $('#detail-id-badge').textContent = topic.id;
    const catBadge = $('#detail-cat-badge');
    catBadge.textContent = `${meta.emoji} ${meta.label}`;
    catBadge.style.setProperty('--cat-color', `var(--cat-${topic.category})`);
    $('#detail-title').textContent = topic.title;
    renderLessonMap(topic);

    // 옵션 초기 상태 적용
    $('#ko-toggle').dataset.state = state.options.showKo ? 'on' : 'off';
    $('#ko-toggle').textContent = state.options.showKo ? '표시' : '숨김';
    ['pro', 'con', 'neutral'].forEach(tone => {
      const key = `show${tone.charAt(0).toUpperCase() + tone.slice(1)}`;
      $(`.tone-chip[data-tone="${tone}"]`).dataset.state = state.options[key] ? 'on' : 'off';
    });
    const rateIdx = [0.85, 0.95, 1.1].indexOf(parseFloat(state.options.ttsRate));
    const labels = ['느리게', '보통', '빠르게'];
    $('#tts-rate').textContent = `속도 ${labels[rateIdx >= 0 ? rateIdx : 1]}`;

    // 본문 렌더링
    const body = $('#detail-body');
    body.innerHTML = '';
    topic.sections.forEach(sec => body.appendChild(renderSection(sec)));

    applyDetailOptions();

    // 패널/배경 표시
    $('#detail').hidden = false;
    $('#backdrop').hidden = false;
    $('#detail').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    updateActiveLessonStep();

    // 네비 버튼 상태
    const idx = state.topics.findIndex(t => t.id === topic.id);
    $('#prev-topic').disabled = idx <= 0;
    $('#next-topic').disabled = idx >= state.topics.length - 1;
  }

  function closeDetail() {
    state.currentTopicId = null;
    $('#detail').hidden = true;
    $('#backdrop').hidden = true;
    $('#detail-options').hidden = true;
    $('#lesson-map').innerHTML = '';
    document.body.style.overflow = '';
    stopTTS();
  }

  function applyDetailOptions() {
    $$('.tone-ko').forEach(n => n.classList.toggle('hidden', !state.options.showKo));
    ['pro', 'con', 'neutral'].forEach(tone => {
      const key = `show${tone.charAt(0).toUpperCase() + tone.slice(1)}`;
      $$(`.tone-block[data-tone="${tone}"]`).forEach(n => n.classList.toggle('hidden', !state.options[key]));
    });
  }

  // ──────────────────────────────────────────────────────────
  // 섹션 렌더링
  // ──────────────────────────────────────────────────────────
  function renderLessonMap(topic) {
    const map = $('#lesson-map');
    const counts = getLessonCounts(topic);

    map.innerHTML = '';
    map.appendChild(el('div', { class: 'lesson-summary' },
      el('div', { class: 'lesson-summary-card' },
        el('span', { class: 'summary-kicker' }, 'FLOW'),
        el('strong', {}, `${counts.sections} sections`),
        el('span', {}, 'tap to jump')
      ),
      el('div', { class: 'lesson-summary-card' },
        el('span', { class: 'summary-kicker' }, 'SPEAK'),
        el('strong', {}, `${counts.questions} questions`),
        el('span', {}, 'with answer banks')
      ),
      el('div', { class: 'lesson-summary-card' },
        el('span', { class: 'summary-kicker' }, 'TOOLS'),
        el('strong', {}, `${counts.helpers} helpers`),
        el('span', {}, 'words + phrases')
      ),
    ));

    map.appendChild(el('div', { class: 'lesson-progress-card' },
      el('div', { class: 'lesson-progress-top' },
        el('span', { class: 'lesson-progress-title' }, 'Lesson progress'),
        el('span', { id: 'lesson-progress-label', class: 'lesson-progress-label' }, `1 / ${counts.sections}`)
      ),
      el('div', { class: 'lesson-progress-track', 'aria-hidden': 'true' },
        el('span', { id: 'lesson-progress-fill', class: 'lesson-progress-fill' })
      ),
      el('div', { class: 'lesson-controls' },
        el('button', {
          id: 'prev-section',
          class: 'lesson-control-btn',
          onClick: () => navigateSection(-1),
        }, '← Prev'),
        el('span', { id: 'lesson-current', class: 'lesson-current' }, 'SMALL TALK'),
        el('button', {
          id: 'next-section',
          class: 'lesson-control-btn primary',
          onClick: () => navigateSection(1),
        }, 'Next →')
      )
    ));

    const rail = el('div', { class: 'lesson-rail' });
    topic.sections.forEach(sec => {
      const meta = SECTION_META[sec.type] || { num: '', label: sec.title, icon: '📄' };
      rail.appendChild(el('button', {
        class: 'lesson-step',
        dataset: { section: sec.type },
        onClick: () => {
          const target = $(`.section[data-type="${sec.type}"]`);
          if (!target) return;
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      },
        el('span', { class: 'lesson-step-num' }, meta.num),
        el('span', { class: 'lesson-step-label' }, `${meta.icon} ${meta.label}`)
      ));
    });
    map.appendChild(rail);
  }

  function navigateSection(dir) {
    const sections = $$('.section');
    if (!sections.length) return;
    const activeType = $('.lesson-step[data-active="true"]')?.dataset.section;
    const currentIndex = Math.max(0, sections.findIndex(sec => sec.dataset.type === activeType));
    const nextIndex = Math.min(sections.length - 1, Math.max(0, currentIndex + dir));
    sections[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateActiveLessonStep() {
    if ($('#detail').hidden) return;
    const panel = $('#detail');
    const marker = panel.getBoundingClientRect().top + Math.min(220, window.innerHeight * 0.32);
    let activeType = '';
    let closest = { type: '', distance: Number.POSITIVE_INFINITY };
    const sections = $$('.section');
    sections.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      if (rect.top <= marker && rect.bottom >= marker) {
        activeType = sec.dataset.type;
      }
      const distance = Math.abs(rect.top - marker);
      if (distance < closest.distance) {
        closest = { type: sec.dataset.type, distance };
      }
    });
    if (!activeType) activeType = closest.type || $('.section')?.dataset.type || '';
    $$('.lesson-step').forEach(step => {
      step.dataset.active = step.dataset.section === activeType ? 'true' : 'false';
    });

    const activeIndex = Math.max(0, sections.findIndex(sec => sec.dataset.type === activeType));
    const total = Math.max(1, sections.length);
    const progress = ((activeIndex + 1) / total) * 100;
    const activeMeta = SECTION_META[activeType] || { label: activeType || 'SECTION' };
    const progressLabel = $('#lesson-progress-label');
    const progressFill = $('#lesson-progress-fill');
    const current = $('#lesson-current');
    const prev = $('#prev-section');
    const next = $('#next-section');
    if (progressLabel) progressLabel.textContent = `${activeIndex + 1} / ${total}`;
    if (progressFill) progressFill.style.width = `${progress}%`;
    if (current) current.textContent = activeMeta.label;
    if (prev) prev.disabled = activeIndex <= 0;
    if (next) next.disabled = activeIndex >= total - 1;
  }

  function renderSection(sec) {
    const meta = SECTION_META[sec.type] || { num: '', label: sec.title, icon: '📄' };
    const wrap = el('section', { class: 'section', dataset: { type: sec.type } });

    wrap.appendChild(el('div', { class: 'section-head' },
      el('span', { class: 'section-num' }, meta.num),
      el('span', { class: 'section-title' }, `${meta.icon} ${meta.label}`),
    ));

    if (sec.subtitle) {
      wrap.appendChild(el('div', { class: 'section-subtitle' }, sec.subtitle));
    }

    if (sec.type === 'small_talk' || sec.type === 'warm_up' || sec.type === 'keep_talking'
        || sec.type === 'easy_entry' || sec.type === 'main_discussion') {
      (sec.questions || []).forEach(q => wrap.appendChild(renderQuestion(q)));
    } else if (sec.type === 'warm_up_v2') {
      wrap.appendChild(renderWarmupV2(sec));
    } else if (sec.type === 'pop_quiz') {
      (sec.items || []).forEach(item => wrap.appendChild(renderPopQuiz(item)));
    } else if (sec.type === 'background' || sec.type === 'read') {
      wrap.appendChild(el('div', { class: 'content-quote' }, sec.content || ''));
    } else if (sec.type === 'discussion_flow') {
      (sec.phases || []).forEach(p => wrap.appendChild(renderPhase(p)));
    } else if (sec.type === 'words') {
      const list = el('div', { class: 'word-list' });
      (sec.items || []).forEach(it => list.appendChild(renderWord(it)));
      wrap.appendChild(list);
    } else if (sec.type === 'try_phrases') {
      const list = el('div', { class: 'word-list' });
      (sec.items || []).forEach(it => list.appendChild(renderWord(it, true)));
      wrap.appendChild(list);
    } else if (sec.type === 'closing' || sec.type === 'final_line') {
      wrap.appendChild(el('div', { class: 'closing-task' }, sec.content || ''));
    }

    return wrap;
  }

  function renderWarmupV2(sec) {
    const wrap = el('div', { class: 'warmup-v2' });
    const type = sec.warmup_type || 'list';
    const items = sec.items || [];

    if (type === 'this_or_that' || type === 'would_you_rather') {
      items.forEach((it, i) => {
        const row = el('div', { class: 'tot-row' });
        if (typeof it === 'object' && (it.a || it.b)) {
          row.appendChild(el('span', { class: 'tot-num' }, String(it.round || (i + 1))));
          row.appendChild(el('span', { class: 'tot-side left' }, it.a || ''));
          row.appendChild(el('span', { class: 'tot-vs' }, 'VS'));
          row.appendChild(el('span', { class: 'tot-side' }, it.b || ''));
        } else {
          row.appendChild(el('span', { class: 'tot-num' }, String(i + 1)));
          row.appendChild(el('span', { class: 'tot-side' }, String(it)));
        }
        wrap.appendChild(row);
      });
    } else if (type === 'ranking') {
      const ol = el('ol', { class: 'rank-list' });
      items.forEach(it => {
        const text = typeof it === 'object' ? (it.text || JSON.stringify(it)) : String(it);
        ol.appendChild(el('li', {}, text));
      });
      wrap.appendChild(ol);
    } else {
      items.forEach((it, i) => {
        const row = el('div', { class: 'tot-row' });
        row.appendChild(el('span', { class: 'tot-num' }, String(i + 1)));
        const text = typeof it === 'object'
          ? (it.text || `${it.a || ''} or ${it.b || ''}`)
          : String(it);
        row.appendChild(el('span', { class: 'tot-side' }, text));
        wrap.appendChild(row);
      });
    }
    return wrap;
  }

  function renderQuestion(q) {
    const block = el('div', { class: 'q-block' });
    block.appendChild(el('h4', { class: 'q-title' }, q.q));
    if (q.template) {
      block.appendChild(el('div', { class: 'q-template' }, `템플릿: ${q.template}`));
    }
    if (q.starters && q.starters.length) {
      const sw = el('div', { class: 'starter-list' });
      q.starters.forEach(s => sw.appendChild(el('div', { class: 'starter-chip' },
        el('span', { class: 'starter-text' }, `↳ ${s}`),
        makeCopyButton(s)
      )));
      block.appendChild(sw);
    }
    if (q.brainstorm) {
      block.appendChild(el('div', { class: 'brainstorm' }, q.brainstorm));
    }
    const answerTabs = el('div', { class: 'answer-tabs', role: 'group', 'aria-label': '답변 보기 방식' });
    [
      ['all', 'All'],
      ['pro', 'Pro'],
      ['con', 'Con'],
      ['neutral', 'Neutral'],
    ].forEach(([mode, label]) => {
      answerTabs.appendChild(el('button', {
        class: 'answer-tab',
        dataset: { mode, active: mode === 'all' ? 'true' : 'false' },
        onClick: () => setQuestionTone(block, mode),
      }, label));
    });
    block.appendChild(answerTabs);

    ['pro', 'con', 'neutral'].forEach(tone => {
      const ans = q.answers && q.answers[tone];
      if (!ans) return;
      const tb = el('div', { class: 'tone-block', dataset: { tone } });
      tb.appendChild(el('div', { class: 'tone-label' },
        tone === 'pro' ? '👍 Pro' : tone === 'con' ? '👎 Con' : '😐 Neutral / Personal',
        ans.label ? ` · ${ans.label}` : ''
      ));
      if (ans.en) {
        const enWrap = el('div', { class: 'tone-en' });
        enWrap.appendChild(document.createTextNode(ans.en));
        enWrap.appendChild(makeTTSButton(ans.en));
        tb.appendChild(enWrap);
      }
      if (ans.ko) {
        tb.appendChild(el('div', { class: 'tone-ko' }, ans.ko));
      }
      block.appendChild(tb);
    });
    if (q.key_phrases && q.key_phrases.length) {
      const kp = el('div', { class: 'key-phrases' });
      q.key_phrases.forEach(p => kp.appendChild(el('span', { class: 'kp-chip' }, p)));
      block.appendChild(kp);
    }
    return block;
  }

  function setQuestionTone(block, mode) {
    $$('.answer-tab', block).forEach(btn => {
      btn.dataset.active = btn.dataset.mode === mode ? 'true' : 'false';
    });
    $$('.tone-block', block).forEach(tb => {
      tb.classList.toggle('focus-hidden', mode !== 'all' && tb.dataset.tone !== mode);
    });
  }

  function renderPhase(phase) {
    const wrap = el('div', { class: 'phase-block' });
    wrap.appendChild(el('div', { class: 'phase-name' }, phase.name));
    (phase.questions || []).forEach(q => wrap.appendChild(renderQuestion(q)));
    return wrap;
  }

  function renderPopQuiz(item) {
    const wrap = el('div', { class: 'pq-item' });
    wrap.appendChild(el('div', { class: 'pq-wrong' }, `"${item.wrong}"`));
    (item.natural || []).forEach(n => {
      const row = el('div', { class: 'pq-natural' });
      row.appendChild(document.createTextNode(`"${n}"`));
      row.appendChild(makeTTSButton(n));
      wrap.appendChild(row);
    });
    if (item.explanation) {
      wrap.appendChild(el('div', { class: 'pq-explain' }, item.explanation));
    }
    return wrap;
  }

  function renderWord(item, isPhrase = false) {
    const wrap = el('div', { class: isPhrase ? 'word-item phrase-item' : 'word-item' });
    const head = el('div', { class: isPhrase ? 'word-phrase phrase-text' : 'word-phrase' });
    head.appendChild(el('span', { class: 'word-main' }, item.phrase));
    if (item.ko) head.appendChild(el('span', { class: 'word-ko' }, `— ${item.ko}`));
    head.appendChild(makeTTSButton(item.phrase));
    head.appendChild(makeCopyButton(item.phrase));
    wrap.appendChild(head);
    if (item.example) {
      const ex = el('div', { class: 'word-example' });
      ex.appendChild(document.createTextNode(item.example));
      ex.appendChild(makeTTSButton(item.example));
      wrap.appendChild(ex);
    }
    return wrap;
  }

  function makeCopyButton(text) {
    return el('button', {
      class: 'copy-btn',
      'aria-label': '표현 복사',
      title: '표현 복사',
      onClick: async (e) => {
        e.stopPropagation();
        await copyText(text, e.currentTarget);
      },
    }, '⧉');
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      btn.dataset.copied = 'true';
      btn.textContent = '✓';
      showToast('Copied');
      window.setTimeout(() => {
        btn.dataset.copied = 'false';
        btn.textContent = '⧉';
      }, 900);
    } catch {
      btn.textContent = '!';
      showToast('Copy failed');
      window.setTimeout(() => {
        btn.textContent = '⧉';
      }, 900);
    }
  }

  let toastTimer = null;
  function showToast(message) {
    let toast = $('#toast');
    if (!toast) {
      toast = el('div', { id: 'toast', class: 'toast', 'aria-live': 'polite' });
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.show = 'true';
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.dataset.show = 'false';
    }, 1200);
  }

  // ──────────────────────────────────────────────────────────
  // TTS
  // ──────────────────────────────────────────────────────────
  let currentUtter = null;

  function makeTTSButton(text) {
    const btn = el('button', {
      class: 'tts-btn',
      'aria-label': '영어로 읽어주기',
      onClick: (e) => {
        e.stopPropagation();
        speakText(text, btn);
      },
    }, '🔊');
    return btn;
  }

  function speakText(text, btn) {
    if (!('speechSynthesis' in window)) {
      alert('이 브라우저는 음성 읽기를 지원하지 않아요.');
      return;
    }
    stopTTS();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = parseFloat(state.options.ttsRate);
    utter.pitch = 1.0;

    // en-US voice 골라잡기
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Samantha'))
                  || voices.find(v => v.lang === 'en-US')
                  || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utter.voice = preferred;

    utter.onstart = () => btn && btn.setAttribute('data-playing', 'true');
    utter.onend = utter.onerror = () => btn && btn.removeAttribute('data-playing');

    speechSynthesis.speak(utter);
    currentUtter = utter;
  }

  function stopTTS() {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    $$('.tts-btn[data-playing="true"]').forEach(b => b.removeAttribute('data-playing'));
    currentUtter = null;
  }

  // 일부 브라우저는 voices가 늦게 로드됨
  if ('speechSynthesis' in window && speechSynthesis.getVoices().length === 0) {
    speechSynthesis.addEventListener('voiceschanged', () => {}, { once: true });
  }

  // ──────────────────────────────────────────────────────────
  // 부트
  // ──────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
