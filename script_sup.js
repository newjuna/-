// ============================================================
// 관리감독자 평가 시스템 — script_sup.js
// GitHub Pages에 이 파일을 올리고
// index.html에서 <script src="script_sup.js?v=1"></script> 로 불러오세요
// ============================================================

// ★ 반드시 실제 Apps Script 배포 URL로 교체하세요
const SUP_GAS_URL = 'https://script.google.com/macros/s/AKfycbwG73J7okWAK7hakI8WOjsRF83K8tvIi_TKqeVSVfs4-ysaAI2Fk-vMNDd6Nl9W26sH/exec';

// ---- JSONP 헬퍼 ----
function callGAS(params, onSuccess, onError) {
  const cbName = 'supCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const scriptId = 'supScript_' + cbName;

  window[cbName] = function (res) {
    delete window[cbName];
    document.getElementById(scriptId)?.remove();
    if (res && res.error) { (onError || console.error)(res.error); return; }
    onSuccess(res);
  };

  const qs = Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v))
    .join('&');

  const s = document.createElement('script');
  s.id = scriptId;
  s.src = SUP_GAS_URL + '?' + qs + '&callback=' + cbName;
  s.onerror = () => {
    delete window[cbName];
    s.remove();
    (onError || console.error)('네트워크 오류');
    hideSupLoader();
  };
  document.body.appendChild(s);
}

// ---- 로더 ----
function showSupLoader(msg) {
  const l = document.getElementById('loader');
  if (l) { l.style.display = 'flex'; if (l.childNodes[0]) l.childNodes[0].textContent = msg || '처리 중...'; else l.textContent = msg || '처리 중...'; }
}
function hideSupLoader() {
  const l = document.getElementById('loader');
  if (l) l.style.display = 'none';
}

// ---- 화면 전환 ----
function showStep(name) {
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('step' + name);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}

function initLogin() { showStep('Login'); }
function initDashboard() { showStep('Dash'); loadDashboard(); }
function doLogout() {
  supCurrentUser = null;
  localStorage.removeItem('supUser');
  showStep('Login');
}
function openHistory() {
  showSupLoader('이력 조회 중...');
  callGAS({ action: 'sup_history' },
    list => {
      hideSupLoader();
      const filtered = supCurrentUser ? list.filter(h => h.storeName === supCurrentUser.storeName) : list;
      const el = document.getElementById('historyList');
      if (!filtered.length) {
        el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">점검 이력이 없습니다.</p>';
      } else {
        el.innerHTML = filtered.map(h =>
          `<div class="card" style="cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-weight:700;font-size:14px;">${h.date}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:2px;">${h.storeName}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:20px;font-weight:900;color:var(--blue);">${h.avgConverted}점</div>
                ${h.criticalZero && h.criticalZero.length ? '<div style="font-size:11px;color:var(--red);font-weight:700;">⚠️ 중점관리</div>' : ''}
              </div>
            </div>
          </div>`).join('');
      }
      showStep('History');
    },
    err => { hideSupLoader(); alert('오류: ' + err); }
  );
}

// ---- 전역 변수 ----
let supCurrentUser = null;
let supCheckItems = [];
let supScores = {};
let supImprovementData = [];
let _supHalfResult = null;
let _supImpFilter = 'all';

// ---- 초기화 ----
function initSupLoginPage() {
  supCurrentUser = JSON.parse(localStorage.getItem('supUser') || 'null');
  if (supCurrentUser) {
    document.getElementById('supCurrentStore').textContent = supCurrentUser.cleanName || supCurrentUser.storeName;
    showStep('Menu');
  } else {
    showStep('Login');
  }
}

function initSupDashboard() {
  showStep('Dash');
  loadSupDashboard();
}

// ---- 로그인 ----
function onSupStoreSearch(keyword) {
  const dd = document.getElementById('supStoreDropdown');
  if (!keyword || keyword.length < 1) { dd.style.display = 'none'; return; }

  callGAS({ action: 'sup_searchStore', keyword },
    list => {
      if (!list || list.length === 0) { dd.style.display = 'none'; return; }
      dd.innerHTML = list.map(name =>
        `<div onclick="selectSupStore('${name.replace(/'/g, "\\'")}')"
          style="padding:12px 16px;cursor:pointer;font-size:14px;border-bottom:1px solid #f3f4f6;"
          onmouseover="this.style.background='#EFF6FF'" onmouseout="this.style.background='white'">${name}</div>`
      ).join('');
      dd.style.display = 'block';
    },
    err => console.error(err)
  );
}

function selectSupStore(name) {
  document.getElementById('supStoreSearch').value = name;
  document.getElementById('supStoreDropdown').style.display = 'none';
  document.getElementById('supSelectedStoreName').textContent = name;
  document.getElementById('supSelectedStoreBox').style.display = 'block';
}

function doSupLogin() {
  const name = document.getElementById('supStoreSearch').value.trim();
  const pw = document.getElementById('supLoginPw').value.trim();
  const errBox = document.getElementById('supLoginError');
  if (!name) { errBox.textContent = '매장명을 선택해 주세요.'; errBox.style.display = 'block'; return; }
  if (pw.length !== 8) { errBox.textContent = '오픈일 8자리를 입력해 주세요 (예: 20130613)'; errBox.style.display = 'block'; return; }
  errBox.style.display = 'none';
  showSupLoader('인증 중...');

  callGAS({ action: 'sup_login', storeName: name, pw },
    res => {
      hideSupLoader();
      if (!res.success) { errBox.textContent = res.msg; errBox.style.display = 'block'; return; }
      supCurrentUser = res;
      localStorage.setItem('supUser', JSON.stringify(res));
      document.getElementById('supCurrentStore').textContent = res.cleanName || res.storeName;
      showStep('Menu');
    },
    err => { hideSupLoader(); errBox.textContent = '오류: ' + err; errBox.style.display = 'block'; }
  );
}

function supLogout() {
  supCurrentUser = null;
  localStorage.removeItem('supUser');
  showStep('Login');
}

// ---- 점검 시작 ----
function startSupCheck() {
  if (!supCurrentUser) { showStep('Login'); return; }
  showSupLoader('항목 불러오는 중...');

  callGAS({ action: 'sup_getItems' },
    items => {
      hideSupLoader();
      supCheckItems = items;
      supScores = {};
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      document.getElementById('supCheckStoreName').textContent = supCurrentUser.cleanName || supCurrentUser.storeName;
      document.getElementById('supCheckDate').textContent = dateStr;
      renderSupChecklist(items);
      showStep('Check');
    },
    err => { hideSupLoader(); alert('오류: ' + err); }
  );
}

function renderSupChecklist(items) {
  const container = document.getElementById('supChecklistContainer');
  const groupLabels = { A: '🔧 기계·설비 안전점검', B: '🦺 보호구·방호장치', C: '🚑 산재보고·응급조치', D: '🧹 정리정돈·통로확보', E: '📢 안전보건 지도', F: '⚠️ 위험성평가' };
  let lastGroup = '';
  let html = '';

  items.forEach(item => {
    if (item.legalDutyPrimary !== lastGroup) {
      lastGroup = item.legalDutyPrimary;
      html += `<div style="margin:18px 0 10px;font-weight:800;font-size:13px;color:#374151;">
        <span class="badge bg-${item.legalDutyPrimary}">${item.legalDutyPrimary}</span>
        ${groupLabels[item.legalDutyPrimary] || ''}
      </div>`;
    }
    html += `
    <div class="card ${item.criticalFlag === 'Y' ? 'critical' : ''}" id="card_${item.checkId}" style="margin-bottom:14px;padding:16px;">
      <div style="margin-bottom:10px;">
        <span style="font-size:10px;color:#9ca3af;font-weight:600;">#${item.excelSeq} ${item.category}</span>
        ${item.criticalFlag === 'Y' ? '<span style="color:#C62828;font-size:10px;font-weight:700;margin-left:6px;">★중점</span>' : ''}
        <div style="font-size:13px;font-weight:700;color:#1f2937;margin-top:4px;line-height:1.5;">${item.title}</div>
      </div>
      <div class="score-row">
        ${[0, 1, 2, 3, 4, 5].map(s => `<div class="score-btn" id="btn_${item.checkId}_${s}" onclick="selectSupScore('${item.checkId}',${s})">${s}점</div>`).join('')}
      </div>
    </div>`;
  });
  container.innerHTML = html;
  updateSupProgress();
}

function selectSupScore(checkId, score) {
  [0, 1, 2, 3, 4, 5].forEach(s => {
    const btn = document.getElementById(`btn_${checkId}_${s}`);
    if (btn) { btn.className = 'score-btn'; if (s === score) btn.classList.add('s' + s); }
  });
  if (!supScores[checkId]) supScores[checkId] = {};
  supScores[checkId].score = score;
  document.getElementById(`card_${checkId}`)?.classList.add('scored');
  updateSupProgress();
}

function updateSupProgress() {
  const done = Object.keys(supScores).filter(k => supScores[k].score !== undefined).length;
  document.getElementById('supCheckProgress').textContent = `${done}/${supCheckItems.length}`;
}

function saveSupCheck() {
  const missing = supCheckItems.filter(i => !supScores[i.checkId] || supScores[i.checkId].score === undefined);
  if (missing.length > 0) { alert(`${missing.length}개 항목이 입력되지 않았습니다.`); return; }

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const saveData = {
    date: dateStr,
    inspectorName: supCurrentUser.cleanName || supCurrentUser.storeName,
    hq: supCurrentUser.hq || '', dept: supCurrentUser.dept || '', team: supCurrentUser.team || '',
    storeName: supCurrentUser.storeName,
    isEditMode: false,
    items: supCheckItems.map(item => ({
      checkId: item.checkId, excelSeq: item.excelSeq, title: item.title, category: item.category,
      legalDutyPrimary: item.legalDutyPrimary, legalDutySecondary: item.legalDutySecondary,
      rawScore: supScores[item.checkId]?.score ?? 0,
      photoUrl: '', remark: ''
    }))
  };

  showSupLoader('저장 중...');
  callGAS({ action: 'sup_save', data: encodeURIComponent(JSON.stringify(saveData)) },
    () => { hideSupLoader(); showSupResult(saveData); },
    err => { hideSupLoader(); alert('저장 오류: ' + err); }
  );
}

function showSupResult(data) {
  document.getElementById('supResultSubtitle').textContent = `${data.storeName} · ${data.date}`;
  const weights = { A: 0.30, B: 0.15, C: 0.10, D: 0.20, E: 0.10, F: 0.15 };
  const labels = { A: '기계·설비', B: '보호구', C: '응급조치', D: '정리정돈', E: '지도조언', F: '위험성평가' };
  const groups = {};
  data.items.forEach(i => {
    if (!groups[i.legalDutyPrimary]) groups[i.legalDutyPrimary] = [];
    groups[i.legalDutyPrimary].push(i.rawScore / 5 * 100);
  });
  let final = 0;
  let html = '';
  Object.keys(labels).forEach(g => {
    const arr = groups[g] || [];
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    final += avg * weights[g];
    const pct = Math.round(avg);
    html += `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span><span class="sup-badge sup-badge-${g}">${g}</span> ${labels[g]}</span><b>${pct}점</b>
      </div>
      <div style="background:#f3f4f6;border-radius:6px;height:8px;">
        <div style="background:#1565C0;height:8px;border-radius:6px;width:${pct}%;"></div>
      </div>
    </div>`;
  });
  final = Math.round(final * 10) / 10;
  const grade = final >= 90 ? '우수' : final >= 80 ? '양호' : final >= 70 ? '보통' : final >= 60 ? '미흡' : '부진';
  document.getElementById('supResultGroupScores').innerHTML =
    `<div class="sup-group-card"><div style="text-align:center;margin-bottom:14px;">
      <div style="font-size:36px;font-weight:800;color:#1565C0;">${final}점</div>
      <span class="sup-grade-badge grade-${grade}">${grade}</span>
    </div>${html}</div>`;

  const CRITICAL = ['CHECK_044', 'CHECK_049', 'CHECK_063', 'CHECK_074', 'CHECK_075', 'CHECK_076', 'CHECK_077', 'CHECK_082', 'CHECK_101'];
  const criticals = data.items.filter(i => i.rawScore === 0 && CRITICAL.includes(i.checkId));
  const critBox = document.getElementById('supResultCritical');
  if (criticals.length > 0) {
    critBox.style.display = 'block';
    document.getElementById('supResultCriticalList').innerHTML = criticals.map(i => `<div style="font-size:12px;padding:4px 0;">• #${i.excelSeq} ${i.title}</div>`).join('');
  } else { critBox.style.display = 'none'; }
  showStep('Result');
}

// ---- 이력 조회 ----
function openSupHistory() {
  showSupLoader('이력 조회 중...');
  callGAS({ action: 'sup_history' },
    list => {
      hideSupLoader();
      const filtered = supCurrentUser ? list.filter(h => h.storeName === supCurrentUser.storeName) : list;
      const el = document.getElementById('supHistoryContainer');
      if (!filtered.length) { el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">점검 이력이 없습니다.</p>'; }
      else {
        el.innerHTML = filtered.map(h =>
          `<div class="sup-item-card" style="cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div><div style="font-weight:700;font-size:14px;">${h.date}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px;">${h.storeName}</div></div>
              <div style="text-align:right;">
                <div style="font-size:18px;font-weight:800;color:#1565C0;">${h.avgConverted}점</div>
                ${h.criticalZero && h.criticalZero.length ? '<div style="font-size:11px;color:#C62828;font-weight:700;">⚠️ 중점관리</div>' : ''}
              </div>
            </div>
          </div>`).join('');
      }
      showStep('History');
    },
    err => { hideSupLoader(); alert('오류: ' + err); }
  );
}

// ---- 대시보드 ----
function loadSupDashboard() {
  showSupLoader('대시보드 집계 중...');
  callGAS({ action: 'sup_dashboard' },
    data => {
      hideSupLoader();
      document.getElementById('dashSubmitRate').textContent = data.submitRate + '%';
      document.getElementById('dashSubmitCount').textContent = `${data.weekCount}/${data.totalStores}개소`;
      document.getElementById('dashTotalAvg').textContent = data.totalAvg + '점';

      const labels = { A: '기계·설비(30%)', B: '보호구(15%)', C: '응급(10%)', D: '정리(20%)', E: '지도(10%)', F: '위험성(15%)' };
      document.getElementById('dashGroupScores').innerHTML = Object.keys(labels).map(g => {
        const s = Math.round(data.groupScores[g] || 0);
        return `<div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
            <span><span class="sup-badge sup-badge-${g}">${g}</span> ${labels[g]}</span><b>${s}점</b>
          </div>
          <div style="background:#f3f4f6;border-radius:4px;height:8px;">
            <div style="background:#1565C0;height:8px;border-radius:4px;width:${s}%;"></div>
          </div>
        </div>`;
      }).join('');

      drawSupBarChart(data.groupScores);

      const el = document.getElementById('dashCriticalList');
      if (!data.criticalStores || !data.criticalStores.length) {
        el.innerHTML = '<p style="color:#6b7280;font-size:13px;">중점관리 필요 매장 없음 ✅</p>';
      } else {
        el.innerHTML = data.criticalStores.map(s =>
          `<div style="padding:8px;background:#FEF2F2;border-radius:8px;margin-bottom:6px;font-size:13px;">
            <b>${s.store}</b>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${s.items.map(i => i.title).join(' / ')}</div>
          </div>`).join('');
      }
    },
    err => { hideSupLoader(); alert('오류: ' + err); }
  );
}

function drawSupBarChart(scores) {
  if (typeof google === 'undefined' || !google.charts) return;
  google.charts.load('current', { packages: ['corechart'] });
  google.charts.setOnLoadCallback(() => {
    const data = google.visualization.arrayToDataTable([
      ['업무군', '점수', { role: 'style' }],
      ['A.설비', scores.A || 0, '#1565C0'],
      ['B.보호구', scores.B || 0, '#6A1B9A'],
      ['C.응급', scores.C || 0, '#C62828'],
      ['D.정리', scores.D || 0, '#E65100'],
      ['E.지도', scores.E || 0, '#2E7D32'],
      ['F.위험성', scores.F || 0, '#00838F']
    ]);
    new google.visualization.BarChart(document.getElementById('dashGroupChart'))
      .draw(data, { legend: { position: 'none' }, hAxis: { minValue: 0, maxValue: 100 }, chartArea: { width: '70%', height: '85%' } });
  });
}

// ---- 반기평가 ----
(function initSupYearSel() {
  const sel = document.getElementById('supYearSel');
  if (!sel) return;
  const yr = new Date().getFullYear();
  for (let y = yr; y >= yr - 3; y--) sel.add(new Option(y + '년', y));
  // 현재 반기 자동 선택
  const halfSel = document.getElementById('supHalfSel');
  if (halfSel) halfSel.value = new Date().getMonth() < 6 ? 'H1' : 'H2';
})();

function loadSupHalfYear() {
  const half = document.getElementById('supHalfSel').value;
  const year = parseInt(document.getElementById('supYearSel').value);
  showSupLoader('반기평가 집계 중...');

  callGAS({ action: 'sup_halfYear', half, year },
    res => {
      hideSupLoader();
      _supHalfResult = res;
      const tbody = document.getElementById('supHalfTableBody');
      if (!res.stores || !res.stores.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:20px;">데이터 없음</td></tr>';
      } else {
        tbody.innerHTML = res.stores.map((s, i) =>
          `<tr style="${s.criticalFlag ? 'background:#FFF3CD;' : ''}${i === 0 ? 'background:#EFF6FF;' : ''}">
            <td style="font-weight:700;font-size:12px;">${s.storeName}</td>
            ${['A', 'B', 'C', 'D', 'E', 'F'].map(g => `<td>${Math.round(s.groupAvgs[g] || 0)}</td>`).join('')}
            <td style="font-weight:800;color:#1565C0;">${s.final}</td>
            <td><span class="sup-grade-badge grade-${s.grade}" style="font-size:11px;padding:2px 8px;">${s.grade}</span></td>
          </tr>`).join('');
      }
      const avg = res.stores.length ? res.stores.reduce((a, b) => a + b.final, 0) / res.stores.length : 0;
      document.getElementById('supHalfSummary').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">
          <div><div style="font-size:22px;font-weight:800;color:#1565C0;">${res.stores.length}</div><div style="font-size:11px;color:#6b7280;">평가 매장</div></div>
          <div><div style="font-size:22px;font-weight:800;color:#2E7D32;">${Math.round(avg * 10) / 10}</div><div style="font-size:11px;color:#6b7280;">전체 평균</div></div>
          <div><div style="font-size:22px;font-weight:800;color:#C62828;">${res.stores.filter(s => s.criticalFlag).length}</div><div style="font-size:11px;color:#6b7280;">중점관리</div></div>
        </div>`;
      document.getElementById('supHalfYearResult').style.display = 'block';
    },
    err => { hideSupLoader(); alert('오류: ' + err); }
  );
}

function exportSupReportBtn() {
  if (!_supHalfResult) return;
  showSupLoader('보고서 생성 중...');
  callGAS({ action: 'sup_export', half: _supHalfResult.half, year: _supHalfResult.year },
    res => {
      hideSupLoader();
      if (res.url) window.open(res.url, '_blank');
    },
    err => { hideSupLoader(); alert('오류: ' + err); }
  );
}

// ---- 개선조치 ----
function loadImprovements() {
  showSupLoader('조회 중...');
  callGAS({ action: 'sup_improvements' },
    data => {
      hideSupLoader();
      supImprovementData = data || [];
      renderImprovementList(supImprovementData, _supImpFilter);
    },
    err => { hideSupLoader(); alert('오류: ' + err); }
  );
}

function filterImprovement(type) {
  _supImpFilter = type;
  renderImprovementList(supImprovementData, type);
}

function renderImprovementList(data, filter) {
  const el = document.getElementById('supImproveList');
  const list = filter === 'all' ? data : data.filter(r => r.status === filter);
  if (!list.length) { el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">항목 없음</p>'; return; }
  el.innerHTML = list.map(r =>
    `<div class="card" style="border-left:4px solid ${r.status === '완료' ? '#2E7D32' : '#E65100'}; margin-bottom:10px; padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:12px;color:#9ca3af;">${r.regDate} · ${r.storeName}</div>
          <div style="font-size:13px;font-weight:700;margin-top:4px;">${r.title}</div>
          <div style="font-size:12px;color:#E65100;margin-top:2px;">원점수: ${r.score}점</div>
        </div>
        <div>${r.status === '완료'
      ? '<span style="color:#2E7D32;font-weight:700;font-size:12px;">✅ 완료</span>'
      : `<button onclick="completeImprovement(${r.rowIndex})" style="background:#2E7D32;color:white;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">완료처리</button>`
    }</div>
      </div>
    </div>`).join('');
}

function completeImprovement(rowIndex) {
  showSupLoader('처리 중...');
  callGAS({ action: 'sup_completeImprove', rowIndex },
    () => {
      hideSupLoader();
      const item = supImprovementData.find(r => r.rowIndex === rowIndex);
      if (item) item.status = '완료';
      renderImprovementList(supImprovementData, _supImpFilter);
    },
    err => { hideSupLoader(); alert('오류: ' + err); }
  );
}
