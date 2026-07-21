(() => {
  'use strict';

  // ── 配置 ──
  const API_BASE = '';
  const LS_CREATOR_KEY = 'moment_creator_id';
  const FETCH_TIMEOUT = 15000; // 15 秒超时（给 Render 冷启动留足时间）

  // ── 带超时的 fetch ──
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return resp;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Toast ──
  let toastTimer;
  function toast(text) {
    let node = document.querySelector('.toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = text;
    requestAnimationFrame(() => node.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 1800);
  }

  // ── Loading 遮罩 ──
  function showLoading(container, message = '正在加载…') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `<div class="loading-spinner"></div><p class="loading-text">${message}</p><p class="loading-hint">服务器可能已休眠，首次加载约需 30 秒</p>`;
    container.appendChild(overlay);
    return overlay;
  }

  function removeLoading(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  // ── Error 占位 ──
  function showError(container, message, onRetry) {
    const el = document.createElement('div');
    el.className = 'error-placeholder';
    el.innerHTML = `
      <p class="error-icon">⚠️</p>
      <p class="error-text">${message}</p>
      <p class="error-hint">如果是首次访问，服务器正在从休眠中唤醒，请稍候重试。</p>
      <button type="button" class="btn btn-primary retry-btn">重新加载</button>
    `;
    const btn = el.querySelector('.retry-btn');
    btn.addEventListener('click', () => {
      el.innerHTML = '<p class="loading-text" style="text-align:center">重试中…</p>';
      if (onRetry) onRetry();
    });
    container.appendChild(el);
    return el;
  }

  // ── 初始化 ──
  const params = new URLSearchParams(location.search);
  const inviteId = params.get('id');

  // 切换 body 溢出控制
  if (inviteId) {
    document.body.style.overflow = 'hidden';
    // ══════════════ 受邀模式：8 屏流程 ══════════════
    initRecipientMode(inviteId);
  } else {
    document.body.style.overflow = 'auto';
    // ══════════════ 创作者模式 ══════════════
    initCreatorMode();
  }

  // ════════════════════════════════════════════
  //  受邀模式
  // ════════════════════════════════════════════
  async function initRecipientMode(id) {
    document.getElementById('app').style.display = '';
    document.getElementById('creatorMode').style.display = 'none';

    // 从后端加载邀请信息
    let remoteConfig = null;
    const appEl = document.getElementById('app');
    const loadingEl = showLoading(appEl, '正在加载邀请信息…');

    try {
      const resp = await fetchWithTimeout(`${API_BASE}/api/invitations/${id}`);
      if (resp.ok) {
        remoteConfig = await resp.json();
      } else if (resp.status === 404) {
        removeLoading(loadingEl);
        showError(appEl, '邀请不存在或已失效', () => initRecipientMode(id));
        return;
      }
    } catch (err) {
      console.warn('加载邀请信息失败（冷启动或网络问题）:', err);
      // 继续用默认值，不阻塞用户
    } finally {
      removeLoading(loadingEl);
    }

    const defaults = {
      to: '你',
      from: '一个很在意你的人',
      intro: '想约你吃顿好吃的',
      note: '我认真准备了这份约饭邀请。',
      invitationId: id,
      foods: [
        ['🍕', '披萨'], ['🍣', '寿司'], ['🍲', '火锅'],
        ['🥩', '烧肉'], ['🍵', '早茶'], ['🍜', '拉面'],
        ['🌶️', '麻辣烫'], ['🦞', '小龙虾'], ['🥗', '其他']
      ],
      places: [
        ['☕', '咖啡馆'], ['🍽️', '餐厅'], ['🎬', '电影院'],
        ['🌳', '公园'], ['🛍️', '商场'], ['🏖️', '海边'],
        ['🖼️', '展览馆'], ['🏠', '我家附近'], ['📍', '其他']
      ],
      times: [
        ['🌙', '今天晚上'], ['✨', '明天下午'], ['💌', '周末全天'], ['💞', '下周都可以']
      ]
    };
    if (remoteConfig) {
      defaults.to = remoteConfig.to_name || defaults.to;
      defaults.from = remoteConfig.from_name || defaults.from;
      defaults.intro = remoteConfig.intro || defaults.intro;
      defaults.note = remoteConfig.note || defaults.note;
    }

    let submitted = false;
    const config = defaults;
    const state = { step: 1, food: '', place: '', time: '', message: '', hesitation: 0 };
    const screen = document.querySelector('#screen');
    const stepLabel = document.querySelector('#stepLabel');
    const progressBar = document.querySelector('#progressBar');
    document.querySelector('#restartBtn').addEventListener('click', () => go(1));

    function esc(value = '') {
      return String(value).replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[s]));
    }
    function ornament() {
      return '<div class="ornament" aria-hidden="true"><span></span><b>✦</b><span></span></div>';
    }
    function actions(primary, secondary = '') {
      return `<div class="actions">${secondary ? `<button type="button" class="btn btn-secondary" data-action="${secondary.action}">${secondary.label}</button>` : ''}<button type="button" class="btn btn-primary" data-action="${primary.action}">${primary.label}<span class="arrow">→</span></button></div>`;
    }

    const pages = {
      1: () => `
        <div class="hero">
          <div class="eyebrow">A moment for ${esc(config.to)}</div>
          <h1 class="title">${esc(config.intro)}<br>准备了一个小 <span class="gold">Moment</span></h1>
          <p class="subtitle">请收下这份约饭邀请</p>
          <div class="art" aria-hidden="true"><div class="letter"></div><div class="envelope"></div><div class="seal"></div></div>
          ${actions({action:'next', label:'轻触打开'})}
        </div>`,
      2: () => `
        <div class="hero">
          <div class="eyebrow">A little something</div>
          <h1 class="title">来自<br><span class="gold">${esc(config.from)}</span>。</h1>
          <p class="subtitle">TA 想认真约你吃一顿好吃的。</p>
          <div class="art" aria-hidden="true"><div class="letter"></div><div class="envelope"></div><div class="seal"></div></div>
          ${actions({action:'next', label:'继续'})}
        </div>`,
      3: () => `
        <div class="hero">
          <div class="heart-art" aria-hidden="true"></div>
          <h1 class="title">可以一起去<br>吃顿饭嘛<span class="gold">？！</span></h1>
          <p class="subtitle">系统检测到：对方已经紧张到开始反复刷新页面了。</p>
          ${ornament()}
          <div class="actions">
            <button type="button" class="btn btn-primary" data-action="accept">愿意 ♡</button>
            <button type="button" class="btn btn-secondary" id="hesitateBtn" data-action="hesitate">再想想嘛</button>
          </div>
        </div>`,
      4: () => `
        <div class="hero">
          <div class="heart-art" aria-hidden="true"></div>
          <h1 class="title">等下，<br>你真的点了<span class="gold">愿意</span>？？😭</h1>
          <p class="subtitle">我都已经准备好被你点"不要"了。</p>
          ${ornament()}
          ${actions({action:'next', label:'好啦好啦'})}
        </div>`,
      5: () => choicePage('我们吃点什么？', '挑一个今天的约会氛围', config.foods, 'food'),
      6: () => choicePage('想去哪里见面？', '选一个你喜欢的地方', config.places, 'place'),
      7: () => `
        <div>
          <h1 class="section-title">什么时候最合适？</h1>
          <p class="section-subtitle">挑一个时间段吧。</p>
          ${ornament()}
          <div class="choice-grid two">
            ${config.times.map(([icon, name]) => choiceCard(icon, name, 'time')).join('')}
          </div>
          <div class="message-box">
            <label class="message-label" for="messageInput">想对 TA 说点什么？（可选）</label>
            <textarea id="messageInput" maxlength="80" placeholder="早就想去了……">${esc(state.message)}</textarea>
            <div class="quick-replies">
              ${['早就想去了', '等你好久了', '必须答应！', '让我先看看时间'].map(v => `<button class="chip" type="button" data-quick="${v}">${v}</button>`).join('')}
            </div>
          </div>
          <div class="form-actions">${actions({action:'submit', label:'送出回应'})}</div>
        </div>`,
      8: () => `
        <div>
          <div class="heart-art" aria-hidden="true"></div>
          <p class="section-subtitle">回应已送出 ✨</p>
          <h1 class="section-title">这一刻，<br><span style="color:var(--gold)">值得被记住。</span></h1>
          <p class="done-note">TA 已经收到你的回应了。</p>
          <div class="summary">
            <div class="summary-card"><div class="summary-label">约定时间</div><div class="summary-value">${esc(state.time)}</div></div>
            <div class="summary-card"><div class="summary-label">想吃</div><div class="summary-value">${esc(state.food)}</div></div>
            <div class="summary-card"><div class="summary-label">在哪</div><div class="summary-value">${esc(state.place)}</div></div>
            ${state.message ? `<div class="summary-card"><div class="summary-label">想说</div><div class="summary-value">${esc(state.message)}</div></div>` : ''}
          </div>
          <div class="actions">
            <button type="button" class="btn btn-secondary" data-action="restart">再看一次</button>
          </div>
        </div>`
    };

    function choicePage(title, subtitle, items, key) {
      return `<div><h1 class="section-title">${title}</h1><p class="section-subtitle">${subtitle}</p>${ornament()}<div class="choice-grid">${items.map(([icon, name]) => choiceCard(icon, name, key, name === '其他')).join('')}</div><div class="form-actions">${actions({action:'next-choice', label:'下一步'})}</div></div>`;
    }
    function choiceCard(icon, name, key, other = false) {
      const selected = state[key] === name ? ' selected' : '';
      return `<button type="button" class="choice-card${other ? ' other' : ''}${selected}" data-choice-key="${key}" data-choice="${esc(name)}"><span class="choice-icon">${icon}</span><span class="choice-name">${esc(name)}</span></button>`;
    }

    function go(step) {
      const target = Math.max(1, Math.min(8, step));
      screen.classList.remove('enter');
      screen.classList.add('leave');
      setTimeout(() => {
        state.step = target;
        screen.className = 'screen' + ([5,6,7,8].includes(target) ? ' form-screen' : '');
        screen.innerHTML = pages[target]();
        stepLabel.textContent = `${target} / 8`;
        progressBar.style.width = `${target * 12.5}%`;
        screen.classList.add('enter');
        bind();
      }, 190);
    }

    function bind() {
      screen.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('click', () => handleAction(el.dataset.action));
      });
      screen.querySelectorAll('[data-choice]').forEach(el => {
        el.addEventListener('click', () => {
          const key = el.dataset.choiceKey;
          state[key] = el.dataset.choice;
          screen.querySelectorAll(`[data-choice-key="${key}"]`).forEach(x => x.classList.toggle('selected', x === el));
          navigator.vibrate?.(18);
        });
      });
      screen.querySelectorAll('[data-quick]').forEach(el => {
        el.addEventListener('click', () => {
          const input = document.querySelector('#messageInput');
          input.value = el.dataset.quick;
          state.message = input.value;
        });
      });
      const input = document.querySelector('#messageInput');
      input?.addEventListener('input', e => state.message = e.target.value.trim());
    }

    async function handleAction(action) {
      switch (action) {
        case 'next': go(state.step + 1); break;
        case 'accept': go(4); break;
        case 'hesitate': {
          state.hesitation += 1;
          const btn = document.querySelector('#hesitateBtn');
          const texts = ['再想一下', '真的不愿意嘛', '别想啦，点左边吧'];
          btn.textContent = texts[Math.min(state.hesitation - 1, texts.length - 1)];
          btn.style.transform = `translateX(${state.hesitation % 2 ? 12 : -12}px)`;
          navigator.vibrate?.([15,30,15]);
          break;
        }
        case 'next-choice': {
          const key = state.step === 5 ? 'food' : 'place';
          if (!state[key]) return toast('先选一个呀～');
          go(state.step + 1);
          break;
        }
        case 'submit': {
          state.message = document.querySelector('#messageInput')?.value.trim() || '';
          if (!state.time) return toast('先选一个时间呀～');
          if (submitted) return toast('已经回应过了～');
          submitted = true;

          // 提交到后端
          try {
            const resp = await fetchWithTimeout(`${API_BASE}/api/responses`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                invitation_id: config.invitationId,
                food: state.food,
                place: state.place,
                time: state.time,
                message: state.message,
                reply: 'accept'
              })
            });
            if (!resp.ok) {
              const err = await resp.json();
              toast(err.error || '提交失败');
              submitted = false;
              return;
            }
          } catch (_) {
            toast('网络错误，但回应已保存');
          }
          go(8);
          break;
        }
        case 'restart': go(1); break;
      }
    }

    go(1);
  }

  // ════════════════════════════════════════════
  //  创作者模式
  // ════════════════════════════════════════════
  function initCreatorMode() {
    document.getElementById('creatorMode').style.display = '';
    document.getElementById('app').style.display = 'none';
    document.getElementById('historyMode').style.display = 'none';

    // 获取/创建创作者身份
    let creatorId = localStorage.getItem(LS_CREATOR_KEY);
    if (!creatorId) {
      creatorId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(LS_CREATOR_KEY, creatorId);
    }

    const $ = id => document.getElementById(id);

    // 生成邀请链接
    $('generateBtn').addEventListener('click', async () => {
      const to = $('cr_to').value.trim() || '你';
      const from = $('cr_from').value.trim() || '一个很在意你的人';
      const intro = $('cr_intro').value.trim() || '想约你吃顿好吃的';
      const note = $('cr_note').value.trim();

      $('generateBtn').disabled = true;
      $('generateBtn').textContent = '生成中…';

      try {
        const resp = await fetchWithTimeout(`${API_BASE}/api/invitations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creator_id: creatorId, from_name: from, to_name: to, intro, note })
        });
        const data = await resp.json();

        if (!resp.ok) {
          throw new Error(data.error || '创建失败');
        }

        // 展示链接
        const box = $('linkbox');
        box.style.display = 'block';
        box.innerHTML = `
          <div style="margin-bottom:8px;color:#e2bc70;font-size:14px">✅ 邀请已创建！把这个链接发给 TA 👇</div>
          <div class="link-copy">${escHtml(data.link)}</div>
          <button class="btn btn-primary" id="copyLinkBtn" type="button" style="margin-top:12px;width:100%">📋 复制链接</button>
        `;
        document.getElementById('copyLinkBtn').addEventListener('click', () => {
          navigator.clipboard.writeText(data.link).then(() => {
            $('copyLinkBtn').textContent = '✓ 已复制';
            setTimeout(() => { $('copyLinkBtn').textContent = '📋 复制链接'; }, 2000);
          });
        });

        // 清空表单但保留称呼
        $('cr_to').value = '';
        $('cr_intro').value = '想约你吃顿好吃的';
        $('cr_note').value = '';

      } catch (err) {
        const linkbox = $('linkbox');
        // 不折叠，直接在表单下方显示错误
        linkbox.style.display = 'block';
        const msg = err.name === 'AbortError'
          ? '请求超时，服务器可能正在从休眠中唤醒（约需 30 秒），请稍候重试🙏'
          : `❌ 创建失败：${err.message}`;
        linkbox.innerHTML = `
          <div style="color:#e06c75;font-size:13px;margin-bottom:10px">${msg}</div>
          <button class="btn btn-primary" id="retryCreateBtn" type="button" style="min-height:46px;font-size:14px">🔄 重试</button>
        `;
        document.getElementById('retryCreateBtn')?.addEventListener('click', () => {
          linkbox.style.display = 'none';
          $('generateBtn').click();
        });
      } finally {
        $('generateBtn').disabled = false;
        $('generateBtn').textContent = '✨ 生成邀请链接';
      }
    });

    // 历史记录按钮
    $('historyBtn').addEventListener('click', () => {
      showHistoryMode(creatorId);
    });

    // 返回按钮（历史页）
    $('backBtn').addEventListener('click', () => {
      document.getElementById('historyMode').style.display = 'none';
      document.getElementById('creatorMode').style.display = '';
    });
  }

  // ── 显示历史记录页 ──
  async function showHistoryMode(creatorId) {
    document.getElementById('creatorMode').style.display = 'none';
    document.getElementById('historyMode').style.display = '';

    await loadInvitations(creatorId);
  }

  // ── 加载邀请列表 ──
  async function loadInvitations(creatorId) {
    const container = document.getElementById('invitationItems');
    container.innerHTML = '<p class="tip" style="text-align:center;padding:24px 0;color:#9d8f99">加载中…</p>';
    try {
      const resp = await fetchWithTimeout(`${API_BASE}/api/invitations?creator_id=${encodeURIComponent(creatorId)}`);

      if (!resp.ok) {
        throw new Error('服务器返回错误');
      }

      const list = await resp.json();

      if (!list.length) {
        container.innerHTML = '<p class="tip" style="text-align:center;padding:40px 0;color:#9d8f99">还没有邀请，创建一个吧 ✨</p>';
        return;
      }

      container.innerHTML = list.map(inv => {
        const hasResponse = inv.status === 'responded';
        const timeStr = inv.responded_at ? inv.responded_at.slice(0, 10) : '';
        return `
          <div class="invite-card">
            <div class="invite-card-header">
              <span class="invite-to">💌 给 ${escHtml(inv.to_name)}</span>
              <span class="invite-status ${hasResponse ? 'responded' : 'pending'}">
                ${hasResponse ? '✅ 已回应' : '⏳ 等待回应'}
              </span>
            </div>
            ${hasResponse ? `
              <div class="invite-response">
                <span>🍽️ ${escHtml(inv.food)}</span>
                <span>📍 ${escHtml(inv.place)}</span>
                <span>🕐 ${escHtml(inv.time)}</span>
                ${inv.response_message ? `<span>💬 ${escHtml(inv.response_message)}</span>` : ''}
              </div>
              <div class="invite-time">${timeStr}</div>
            ` : `
              <div class="invite-link-row">
                <span class="invite-link-text">${escHtml(`${location.origin}/index.html?id=${inv.id}`)}</span>
                <button class="btn-copy-sm" data-link="${escHtml(`${location.origin}/index.html?id=${inv.id}`)}">复制</button>
              </div>
              <div class="invite-time">${inv.created_at ? inv.created_at.slice(0, 10) : ''}</div>
            `}
          </div>
        `;
      }).join('');

      // 绑定复制按钮
      container.querySelectorAll('.btn-copy-sm').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.link);
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '复制'; }, 1500);
        });
      });
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      const msg = isTimeout
        ? '请求超时，服务器可能正在从休眠中唤醒（约需 30 秒）'
        : '加载失败，请确认服务器已启动';
      container.innerHTML = `
        <div class="tip" style="text-align:center;padding:24px 0;color:#e06c75">
          ⚠️ ${msg}
        </div>
        <div style="text-align:center;padding-bottom:12px">
          <button class="btn btn-primary" id="retryLoadBtn" type="button" style="min-width:140px">🔄 重试</button>
        </div>
      `;
      document.getElementById('retryLoadBtn')?.addEventListener('click', () => loadInvitations(creatorId));
    }
  }

  function escHtml(s) {
    return String(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
})();
