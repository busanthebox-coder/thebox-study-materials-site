(() => {
  'use strict';

  const state = {
    items: [],
    filtered: [],
    category: 'ALL',
    query: '',
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value != null && value !== false) node.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach(child => {
      if (child == null || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  async function boot() {
    bindSearch();
    try {
      const res = await fetch('data/pdfs.json');
      if (!res.ok) throw new Error('pdfs.json load failed');
      state.items = await res.json();
    } catch (error) {
      $('#pdf-list').innerHTML = `<p class="loading">PDF 목록을 불러오지 못했어요. (${error.message})</p>`;
      return;
    }
    renderFilters();
    applyFilters();
  }

  function bindSearch() {
    const input = $('#pdf-search');
    const clear = $('#pdf-search-clear');
    input.addEventListener('input', () => {
      state.query = input.value.trim().toLowerCase();
      clear.hidden = !state.query;
      applyFilters();
    });
    clear.addEventListener('click', () => {
      input.value = '';
      state.query = '';
      clear.hidden = true;
      applyFilters();
      input.focus();
    });
  }

  function renderFilters() {
    const counts = state.items.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
    const categories = Object.keys(counts).sort();
    const nav = $('#pdf-category-filters');
    nav.innerHTML = '';
    nav.appendChild(filterChip('ALL', `전체 ${state.items.length}`));
    categories.forEach(category => {
      nav.appendChild(filterChip(category, `${category} ${counts[category]}`));
    });
  }

  function filterChip(category, label) {
    return el('button', {
      class: 'cat-chip',
      dataset: { active: state.category === category },
      onClick: () => {
        state.category = category;
        document.querySelectorAll('#pdf-category-filters .cat-chip').forEach(chip => {
          chip.dataset.active = chip.dataset.category === category ? 'true' : 'false';
        });
        applyFilters();
      },
    }, label);
  }

  function applyFilters() {
    const query = state.query;
    state.filtered = state.items.filter(item => {
      if (state.category !== 'ALL' && item.category !== state.category) return false;
      if (!query) return true;
      return (
        item.category.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        item.filename.toLowerCase().includes(query)
      );
    });
    renderList();
  }

  function renderList() {
    const list = $('#pdf-list');
    const count = $('#pdf-count');
    list.innerHTML = '';
    count.textContent = `${state.filtered.length} / ${state.items.length} PDFs`;

    if (!state.filtered.length) {
      list.appendChild(el('p', { class: 'loading' }, '검색 결과 없음'));
      return;
    }

    const groups = state.filtered.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});

    Object.keys(groups).sort().forEach(category => {
      const group = el('section', { class: 'pdf-group' },
        el('div', { class: 'pdf-group-head' },
          el('h2', {}, category),
          el('span', {}, `${groups[category].length} files`),
        )
      );
      groups[category].forEach(item => group.appendChild(renderPdfItem(item)));
      list.appendChild(group);
    });
  }

  function renderPdfItem(item) {
    return el('article', { class: 'pdf-item' },
      el('div', { class: 'pdf-main' },
        el('span', { class: 'id-badge' }, item.category),
        el('h3', {}, item.title),
        el('p', {}, item.filename),
      ),
      el('div', { class: 'pdf-actions' },
        el('a', { class: 'pdf-btn primary', href: item.url, target: '_blank', rel: 'noopener' }, '열기'),
        el('a', { class: 'pdf-btn', href: item.url, download: item.filename }, '다운로드'),
      )
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
