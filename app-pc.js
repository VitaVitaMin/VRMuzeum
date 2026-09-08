// =============================================================================
// app-pc.js — PC версия:
//             - ОБА МАРКЕРА — АККУРАТНЫЕ КРУЖКИ ОДИНАКОВОГО РАЗМЕРА (radius 0.14)
//               * Экспонат: янтарный кружок с белой точкой
//               * Переход: голубой кружок со стрелочкой внутри
//             - Устранено перекрытие всплывающего окна 3D текстом
//             - Названия сразу видны при первой загрузке
//             - Плавная прозрачность по мере удаления
//             - HTML карточка экспоната
// =============================================================================
(function () {
  'use strict';

  // ── Константы ────────────────────────────────────────────────────────────
  const TRANSITION_DUR = 380;   // мс перехода между комнатами
  const LNK_NEAR       = 3.5;   // м: дистанция четкой видимости
  const LNK_FAR        = 8.5;   // м: дистанция полупрозрачности
  const EX_NEAR        = 3.2;   // м: дистанция четкой видимости
  const EX_FAR         = 7.5;   // м: дистанция полупрозрачности

  // ── Состояние ────────────────────────────────────────────────────────────
  let isInitialized = false;
  let activeModalWrap = null;
  let isTransitioning = false;
  let currentRoomId = '';
  let debugActive = false;
  window.isVRMode = false;

  const _texCache = new Map();

  // ── Утилита: копирование ─────────────────────────────────────────────────
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand failed'));
      } catch (e) { reject(e); }
    });
  }

  // ── Canvas текстуры ───────────────────────────────────────────────────────

  /** Табличка с названием прямо над кружком */
  function makeLabelTex(text, isExhibit) {
    const key = `lbl|${text}|${isExhibit}`;
    if (_texCache.has(key)) return _texCache.get(key);

    const W = 512, H = 110;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, isExhibit ? 'rgba(15, 10, 2, 0.94)' : 'rgba(3, 14, 24, 0.94)');
    bg.addColorStop(1, isExhibit ? 'rgba(28, 16, 4, 0.90)' : 'rgba(5, 22, 38, 0.90)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(6, 6, W - 12, H - 12, 20);
    else ctx.rect(6, 6, W - 12, H - 12);
    ctx.fill();

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(6, 6, W - 12, H - 12, 20);
    else ctx.rect(6, 6, W - 12, H - 12);
    ctx.strokeStyle = isExhibit ? 'rgba(245, 158, 11, 0.85)' : 'rgba(14, 165, 233, 0.85)';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.font = 'bold 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#F8FAFC';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2 + 1, W - 40);

    const url = c.toDataURL();
    _texCache.set(key, url);
    return url;
  }

  /**
   * Кружок перехода — аккуратный диск со стрелочкой внутри
   */
  function makeTransitionCircleTex() {
    const key = 'trans_circle_v1';
    if (_texCache.has(key)) return _texCache.get(key);

    const S = 256, CX = 128, CY = 128;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, S, S);

    // Основной голубой круг
    ctx.beginPath();
    ctx.arc(CX, CY, 118, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(CX, CY, 30, CX, CY, 118);
    grad.addColorStop(0, '#38BDF8');
    grad.addColorStop(1, '#0284C7');
    ctx.fillStyle = grad;
    ctx.fill();

    // Белый кантик
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Стрелочка перехода внутри кружка
    ctx.beginPath();
    ctx.moveTo(CX, 54);       // Острие вверху
    ctx.lineTo(CX + 46, 114); // Правое плечо
    ctx.lineTo(CX + 20, 114); // Правый вырез
    ctx.lineTo(CX + 20, 172); // Правый низ
    ctx.lineTo(CX - 20, 172); // Левый низ
    ctx.lineTo(CX - 20, 114); // Левый вырез
    ctx.lineTo(CX - 46, 114); // Левое плечо
    ctx.closePath();

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.fill();

    const url = c.toDataURL();
    _texCache.set(key, url);
    return url;
  }

  // ==========================================================================
  // A-Frame компонент: Proximity Manager
  // ==========================================================================
  AFRAME.registerComponent('proximity-manager', {
    init: function () {
      this.items  = [];
      this._cp    = new THREE.Vector3();
      this._ep    = new THREE.Vector3();
      this._frame = 0;
    },
    add: function (wrapEl, meshEl, labelEl, near, far) {
      const m = {
        wrapEl,
        meshEl,
        labelEl,
        near: near || 3.0,
        far: far || 7.5,
        isHovered: false,
        labelOpacity: 0.95,
        meshOpacity: 0.95
      };
      this.items.push(m);
      return m;
    },
    clear: function () { this.items = []; },
    tick: function () {
      this._frame++;
      if (this._frame % 2 !== 0) return;

      if (activeModalWrap) return;

      const cam = this.el.sceneEl.camera;
      if (!cam) return;
      cam.getWorldPosition(this._cp);

      for (const m of this.items) {
        if (!m.wrapEl || !m.wrapEl.object3D) continue;
        if (m.wrapEl.dataset.isModalOpen === 'true') continue;

        m.wrapEl.object3D.getWorldPosition(this._ep);
        const d = this._cp.distanceTo(this._ep);

        // 1. Прозрачность кружка по мере удаления
        let targetMeshOpacity = 1.0;
        if (!m.isHovered) {
          if (d <= m.near) {
            targetMeshOpacity = 1.0;
          } else if (d >= m.far) {
            targetMeshOpacity = 0.28;
          } else {
            const factor = (d - m.near) / (m.far - m.near);
            targetMeshOpacity = 1.0 - factor * 0.72;
          }
        }
        m.meshOpacity += (targetMeshOpacity - m.meshOpacity) * 0.16;

        if (m.meshEl && m.meshEl.object3D) {
          m.meshEl.object3D.traverse(child => {
            if (child.material) {
              child.material.transparent = true;
              child.material.opacity = m.meshOpacity;
              child.material.needsUpdate = true;
            }
          });
        }

        // 2. Название прямо над кружком
        let targetLabelOpacity = 0.95;
        if (m.isHovered) {
          targetLabelOpacity = 1.0;
        } else if (d <= m.near) {
          targetLabelOpacity = 0.95;
        } else if (d >= m.far) {
          targetLabelOpacity = 0;
        } else {
          const factor = (d - m.near) / (m.far - m.near);
          targetLabelOpacity = (1.0 - factor) * 0.95;
        }
        m.labelOpacity += (targetLabelOpacity - m.labelOpacity) * 0.18;

        if (m.labelEl && m.labelEl.object3D) {
          m.labelEl.object3D.traverse(child => {
            if (child.material) {
              child.material.transparent = true;
              child.material.opacity = m.labelOpacity;
              child.material.needsUpdate = true;
            }
          });
          m.labelEl.object3D.visible = m.labelOpacity > 0.02;
        }
      }
    }
  });

  // ==========================================================================
  // HTML карточка экспоната
  // ==========================================================================
  function showHTMLModal(exhibit, parentWrap) {
    closeHTMLModal();
    activeModalWrap = parentWrap;

    // Скрываем все 3D маркеры, чтобы они НЕ перекрывали окно!
    const eC = document.getElementById('exhibits-container');
    const lC = document.getElementById('links-container');
    if (eC) eC.setAttribute('visible', 'false');
    if (lC) lC.setAttribute('visible', 'false');

    if (parentWrap) {
      parentWrap.dataset.isModalOpen = 'true';
      const mesh  = parentWrap.querySelector('.marker-mesh');
      const label = parentWrap.querySelector('.marker-label');
      if (mesh)  { mesh.setAttribute('visible', 'false'); mesh.classList.remove('clickable'); }
      if (label) { label.setAttribute('visible', 'false'); }
    }

    const overlay = document.getElementById('exhibit-overlay');
    const titleEl = document.getElementById('exhibit-modal-title');
    const descEl  = document.getElementById('exhibit-desc');
    const imgEl   = document.getElementById('exhibit-img');
    const imgWrap = document.getElementById('exhibit-img-wrap');

    if (titleEl) titleEl.textContent = exhibit.title || 'Экспонат';
    if (descEl)  descEl.textContent  = (exhibit.description || '').replace(/<[^>]*>/gm, '');

    if (exhibit.image && imgWrap) {
      imgEl.src = exhibit.image;
      imgWrap.style.display = '';
    } else if (imgWrap) {
      imgWrap.style.display = 'none';
    }

    if (overlay) {
      overlay.style.display = 'flex';
      requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));
    }
  }

  function closeHTMLModal() {
    const overlay = document.getElementById('exhibit-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      setTimeout(() => { if (!overlay.classList.contains('open')) overlay.style.display = 'none'; }, 310);
    }

    const eC = document.getElementById('exhibits-container');
    const lC = document.getElementById('links-container');
    if (eC) eC.setAttribute('visible', 'true');
    if (lC) lC.setAttribute('visible', 'true');

    if (activeModalWrap) {
      activeModalWrap.dataset.isModalOpen = 'false';
      const mesh  = activeModalWrap.querySelector('.marker-mesh');
      const label = activeModalWrap.querySelector('.marker-label');
      if (mesh)  { mesh.setAttribute('visible', 'true'); mesh.classList.add('clickable'); }
      if (label) { label.setAttribute('visible', 'true'); }
      activeModalWrap = null;
    }
  }

  // ==========================================================================
  // Переход между комнатами
  // ==========================================================================
  function transitionToRoom(targetId, linkPosStr) {
    if (isTransitioning || targetId === currentRoomId) return;
    const next = CONFIG.rooms && CONFIG.rooms[targetId];
    if (!next) { console.warn('[Музей] Комната не найдена:', targetId); return; }

    isTransitioning = true;
    closeHTMLModal();

    const sceneEl = document.getElementById('museum-scene');
    const skyCur  = document.getElementById('sky-pano');
    const skyInc  = document.getElementById('sky-pano-incoming');
    const camRig  = document.getElementById('camera-rig');

    let dir = new THREE.Vector3(0, 0, -2.2);
    if (linkPosStr) {
      const p = linkPosStr.trim().split(/\s+/).map(Number);
      if (p.length === 3 && !p.some(isNaN)) dir.set(p[0], p[1], p[2]).normalize().multiplyScalar(2.2);
    }

    if (skyInc) {
      skyInc.setAttribute('src', next.panorama);
      skyInc.setAttribute('visible', 'true');
      skyInc.setAttribute('material', 'opacity:0; transparent:true; shader:flat; color:#FFFFFF');
    }

    if (sceneEl) sceneEl.classList.add('street-warp-active');

    if (camRig) {
      camRig.setAttribute('animation__mv', {
        property: 'position', to: `${dir.x} ${dir.y} ${dir.z}`,
        dur: TRANSITION_DUR, easing: 'easeInQuad'
      });
    }
    if (skyCur) {
      skyCur.setAttribute('animation__fo', {
        property: 'material.opacity', from: 1, to: 0,
        dur: TRANSITION_DUR, easing: 'easeInQuad'
      });
    }
    if (skyInc) {
      skyInc.setAttribute('animation__fi', {
        property: 'material.opacity', from: 0, to: 1,
        dur: TRANSITION_DUR, easing: 'easeInQuad'
      });
    }

    const titleEl = document.getElementById('room-title');
    if (titleEl) {
      titleEl.classList.add('fading');
      setTimeout(() => {
        titleEl.textContent = next.name || 'Зал музея';
        titleEl.classList.remove('fading');
      }, TRANSITION_DUR / 2);
    }

    setTimeout(() => {
      if (skyCur) {
        skyCur.removeAttribute('animation__fo');
        skyCur.setAttribute('src', next.panorama);
        skyCur.setAttribute('material', 'opacity:1; transparent:true; shader:flat; color:#FFFFFF');
      }
      if (skyInc) {
        skyInc.removeAttribute('animation__fi');
        skyInc.setAttribute('visible', 'false');
        skyInc.setAttribute('src', '');
        skyInc.setAttribute('material', 'opacity:0; shader:flat; color:#FFFFFF');
      }
      if (camRig) { camRig.removeAttribute('animation__mv'); camRig.setAttribute('position', '0 0 0'); }
      if (sceneEl) sceneEl.classList.remove('street-warp-active');

      renderRoomContent(targetId);
      isTransitioning = false;
    }, TRANSITION_DUR + 45);
  }

  // ==========================================================================
  // Рендеринг содержимого комнаты (PC)
  // ==========================================================================
  function renderRoomContent(roomId) {
    currentRoomId = roomId;
    const room = CONFIG.rooms && CONFIG.rooms[roomId];
    if (!room) return;

    window.history.replaceState(null, null, '#' + roomId);

    const titleEl = document.getElementById('room-title');
    if (titleEl) {
      titleEl.textContent = room.name || 'Зал музея';
      titleEl.classList.remove('fading');
    }

    const dbRoom = document.getElementById('debug-current-room');
    if (dbRoom) dbRoom.textContent = roomId;
    const dbSel = document.getElementById('debug-room-select');
    if (dbSel && dbSel.value !== roomId) dbSel.value = roomId;

    const lC = document.getElementById('links-container');
    const eC = document.getElementById('exhibits-container');
    if (lC) lC.innerHTML = '';
    if (eC) eC.innerHTML = '';

    const sceneEl = document.getElementById('museum-scene');
    const prox    = sceneEl && sceneEl.components && sceneEl.components['proximity-manager'];
    if (prox) prox.clear();

    // ── 1. ПЕРЕХОД: АККУРАТНЫЙ КРУЖОК (radius 0.14) СО СТРЕЛОЧКОЙ ──
    (room.links || []).forEach(lk => {
      const wrap = document.createElement('a-entity');
      wrap.setAttribute('position', lk.position);
      wrap.setAttribute('look-at', '[camera]');

      const meshWrap = document.createElement('a-entity');
      meshWrap.classList.add('marker-mesh');

      const circle = document.createElement('a-circle');
      circle.classList.add('clickable');
      circle.setAttribute('radius', '0.14');
      circle.setAttribute('material', `src:${makeTransitionCircleTex()}; shader:flat; transparent:true; opacity:0.95`);
      circle.setAttribute('animation', 'property:scale; dir:alternate; dur:1500; loop:true; to:1.24 1.24 1.24; easing:easeInOutSine');
      meshWrap.appendChild(circle);

      // Название над кружком перехода
      const label = document.createElement('a-image');
      label.classList.add('marker-label');
      label.setAttribute('src', makeLabelTex(lk.label || 'Перейти во второй зал', false));
      label.setAttribute('width', '1.25');
      label.setAttribute('height', '0.28');
      label.setAttribute('position', '0 0.28 0.02');
      label.setAttribute('material', 'shader:flat; transparent:true; opacity:0.95');
      label.object3D.visible = true;

      const go = () => transitionToRoom(lk.target, lk.position);
      circle.addEventListener('click', go);

      // Hover
      const item = prox ? prox.add(wrap, meshWrap, label, LNK_NEAR, LNK_FAR) : null;
      circle.addEventListener('mouseenter', () => {
        if (item) item.isHovered = true;
        meshWrap.setAttribute('animation__sc', { property: 'scale', to: '1.22 1.22 1.22', dur: 140, easing: 'easeOutBack' });
      });
      circle.addEventListener('mouseleave', () => {
        if (item) item.isHovered = false;
        meshWrap.setAttribute('animation__sc', { property: 'scale', to: '1 1 1', dur: 140, easing: 'easeOutBack' });
      });

      wrap.appendChild(meshWrap);
      wrap.appendChild(label);
      lC.appendChild(wrap);
    });

    // ── 2. ЭКСПОНАТ: ТОЧНО ТАКОЙ ЖЕ АККУРАТНЫЙ КРУЖОК (radius 0.14) ──
    (room.exhibits || []).forEach(ex => {
      const wrap = document.createElement('a-entity');
      wrap.setAttribute('position', ex.position);
      wrap.setAttribute('look-at', '[camera]');

      const meshWrap = document.createElement('a-entity');
      meshWrap.classList.add('marker-mesh');

      const circle = document.createElement('a-circle');
      circle.classList.add('clickable');
      circle.setAttribute('radius', '0.14');
      circle.setAttribute('material', 'color:#F59E0B; shader:flat; transparent:true; opacity:0.95');
      circle.setAttribute('animation', 'property:scale; dir:alternate; dur:1500; loop:true; to:1.24 1.24 1.24; easing:easeInOutSine');

      const dot = document.createElement('a-circle');
      dot.setAttribute('radius', '0.055');
      dot.setAttribute('position', '0 0 0.01');
      dot.setAttribute('material', 'color:#FFFFFF; shader:flat');
      circle.appendChild(dot);
      meshWrap.appendChild(circle);

      // Название над кружком экспоната
      const label = document.createElement('a-image');
      label.classList.add('marker-label');
      label.setAttribute('src', makeLabelTex(ex.title, true));
      label.setAttribute('width', '1.25');
      label.setAttribute('height', '0.28');
      label.setAttribute('position', '0 0.28 0.02');
      label.setAttribute('material', 'shader:flat; transparent:true; opacity:0.95');
      label.object3D.visible = true;

      circle.addEventListener('click', () => showHTMLModal(ex, wrap));

      const item = prox ? prox.add(wrap, meshWrap, label, EX_NEAR, EX_FAR) : null;
      circle.addEventListener('mouseenter', () => {
        if (item) item.isHovered = true;
        circle.setAttribute('animation__col', { property: 'material.color', to: '#FCD34D', dur: 150 });
        meshWrap.setAttribute('animation__sc', { property: 'scale', to: '1.22 1.22 1.22', dur: 150, easing: 'easeOutBack' });
      });
      circle.addEventListener('mouseleave', () => {
        if (item) item.isHovered = false;
        circle.setAttribute('animation__col', { property: 'material.color', to: '#F59E0B', dur: 150 });
        meshWrap.setAttribute('animation__sc', { property: 'scale', to: '1 1 1', dur: 150, easing: 'easeOutBack' });
      });

      wrap.appendChild(meshWrap);
      wrap.appendChild(label);
      eC.appendChild(wrap);
    });

    hideLoadingScreen();
  }

  // ==========================================================================
  // Debug панель (PC)
  // ==========================================================================
  function setupDebug() {
    const toggleBtn = document.getElementById('debug-toggle-btn');
    const panel     = document.getElementById('debug-panel');
    const closeBtn  = document.getElementById('debug-close-btn');
    const coordVal  = document.getElementById('debug-coord-val');
    const copyBtn   = document.getElementById('debug-copy-coords-btn');
    const roomSel   = document.getElementById('debug-room-select');
    const fpsEl     = document.getElementById('debug-fps-val');
    const anglesEl  = document.getElementById('debug-angles-val');
    const deviceEl  = document.getElementById('debug-device-val');
    const resetBtn  = document.getElementById('debug-reset-cam-btn');
    const vrTestBtn = document.getElementById('debug-test-vr-btn');

    if (deviceEl) {
      deviceEl.textContent = `🖥 ${window.innerWidth}×${window.innerHeight} DPR${window.devicePixelRatio.toFixed(1)}`;
    }

    if (roomSel && CONFIG.rooms) {
      roomSel.innerHTML = '';
      Object.keys(CONFIG.rooms).forEach(id => {
        const o = document.createElement('option');
        o.value = id; o.textContent = `${CONFIG.rooms[id].name || id} [${id}]`;
        roomSel.appendChild(o);
      });
      roomSel.addEventListener('change', () => transitionToRoom(roomSel.value));
    }

    const toggle = () => {
      debugActive = !debugActive;
      if (panel) panel.style.display = debugActive ? 'block' : 'none';
    };
    if (toggleBtn) toggleBtn.addEventListener('click', toggle);
    if (closeBtn)  closeBtn.addEventListener('click', toggle);

    window.addEventListener('keydown', e => {
      if (e.key === '`' || e.key === 'ё' || e.key === 'Dead') toggle();
      if (e.key === 'Escape') closeHTMLModal();
    });

    if (copyBtn && coordVal) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(coordVal.textContent.trim())
          .then(() => { copyBtn.textContent = '✅ Скопировано!'; copyBtn.classList.add('copied'); setTimeout(() => { copyBtn.textContent = '📋 Скопировать для config.js'; copyBtn.classList.remove('copied'); }, 1800); })
          .catch(() => { copyBtn.textContent = '⚠️ Скопируйте вручную'; setTimeout(() => { copyBtn.textContent = '📋 Скопировать для config.js'; }, 2000); });
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const cam = document.getElementById('main-camera');
        if (cam) cam.setAttribute('rotation', '0 0 0');
      });
    }
    if (vrTestBtn) {
      vrTestBtn.addEventListener('click', () => {
        const s = document.getElementById('museum-scene');
        if (s) { if (s.is('vr-mode')) s.exitVR(); else s.enterVR(); }
      });
    }

    let fc = 0, lt = performance.now();
    AFRAME.registerComponent('pc-debug-tracker', {
      init: function () {
        this._dir = new THREE.Vector3();
        this._pos = new THREE.Vector3();
        this._rot = new THREE.Euler();
      },
      tick: function () {
        fc++;
        const now = performance.now();
        if (now - lt >= 500) {
          const fps = Math.round((fc * 1000) / (now - lt));
          fc = 0; lt = now;
          if (debugActive && fpsEl) fpsEl.textContent = `${fps} FPS`;
        }
        if (!debugActive) return;

        const cam = this.el.sceneEl && this.el.sceneEl.camera;
        if (!cam) return;
        cam.getWorldDirection(this._dir);
        this._dir.multiplyScalar(3.0);
        cam.getWorldPosition(this._pos);
        this._pos.add(this._dir);
        if (coordVal) {
          coordVal.textContent = `${this._pos.x.toFixed(2)} ${this._pos.y.toFixed(2)} ${this._pos.z.toFixed(2)}`;
        }
        if (anglesEl) {
          this._rot.setFromRotationMatrix(cam.matrixWorld, 'YXZ');
          anglesEl.textContent = `Y:${Math.round(THREE.MathUtils.radToDeg(this._rot.y))}° P:${Math.round(THREE.MathUtils.radToDeg(this._rot.x))}°`;
        }
      }
    });

    const sceneEl = document.getElementById('museum-scene');
    if (sceneEl) sceneEl.setAttribute('pc-debug-tracker', '');
  }

  // ==========================================================================
  // Скрыть загрузочный экран
  // ==========================================================================
  let _loadingGone = false;
  function hideLoadingScreen() {
    if (_loadingGone) return;
    _loadingGone = true;
    const ls = document.getElementById('loading-screen');
    if (!ls) return;
    ls.classList.add('hidden');
    setTimeout(() => ls.remove(), 620);
  }

  // ==========================================================================
  // Инициализация ПК
  // ==========================================================================
  function initPC() {
    if (isInitialized) return;
    isInitialized = true;
    console.log('[Музей] ПК версия инициализирована');

    document.body.classList.add('is-pc');

    const sceneEl = document.getElementById('museum-scene');
    if (sceneEl) sceneEl.setAttribute('proximity-manager', '');

    const camera = document.getElementById('main-camera');
    if (camera) {
      camera.setAttribute('look-controls', {
        enabled: true,
        reverseMouseDrag: false,
        touchEnabled: false,
        magicWindowTrackingEnabled: false
      });
    }

    const closeBtn = document.getElementById('exhibit-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeHTMLModal);
    const overlay = document.getElementById('exhibit-overlay');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeHTMLModal(); });

    setupDebug();

    const badge = document.getElementById('device-mode-badge');
    if (badge) badge.textContent = '🖥 ПК (мышь)';

    let startRoom = window.location.hash.replace('#', '');
    if (!startRoom || !CONFIG.rooms || !CONFIG.rooms[startRoom]) {
      startRoom = (CONFIG && CONFIG.startRoom) || 'room1';
    }

    const startDef = CONFIG.rooms[startRoom];
    if (startDef) {
      const sky = document.getElementById('sky-pano');
      if (sky) sky.setAttribute('src', startDef.panorama);
      renderRoomContent(startRoom);
    }

    setTimeout(hideLoadingScreen, 6000);
  }

  window.initMuseumTour = initPC;

  const scene = document.querySelector('a-scene');
  if (scene && scene.hasLoaded) initPC();
  else if (scene) scene.addEventListener('loaded', initPC);
})();
