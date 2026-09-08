// =============================================================================
// app-mobile.js — Мобильная + VR Cardboard версия:
//                 - Чистая стрелка-шеврон перехода БЕЗ кругов и колец
//                 - Запрос разрешения на положение устройства (гироскоп) перед VR
//                 - Названия сразу видны при первой загрузке
//                 - Плавная прозрачность по мере удаления
//                 - Анимация взгляда без лишних кругов
// =============================================================================
(function () {
  'use strict';

  // ── Константы ────────────────────────────────────────────────────────────
  const GAZE_DUR       = 2000;  // 2.0 секунды комфортного взгляда
  const TRANSITION_DUR = 380;   // мс перехода между комнатами
  const LNK_NEAR       = 3.5;   // м: дистанция четкой видимости стрелки
  const LNK_FAR        = 8.5;   // м: дистанция полупрозрачности
  const EX_NEAR        = 3.2;   // м: дистанция четкой видимости экспоната
  const EX_FAR         = 7.5;   // м: дистанция полупрозрачности

  // ── Состояние ────────────────────────────────────────────────────────────
  let isInitialized = false;
  let activeModalWrap = null;
  let isTransitioning = false;
  let currentRoomId = '';
  let debugActive = false;
  window.isVRMode = false;
  let currentPitch = 0, currentYaw = 0;

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

  /** Табличка с названием */
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
    ctx.strokeStyle = isExhibit ? 'rgba(245, 158, 11, 0.85)' : 'rgba(56, 189, 248, 0.85)';
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
   * Чистая навигационная стрелка-шеврон (стиль Google Street View).
   * БЕЗ каких-либо кругов и колец!
   */
  function makeArrowTex() {
    const key = 'clean_street_chevron_v4';
    if (_texCache.has(key)) return _texCache.get(key);

    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, S, S);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;

    ctx.beginPath();
    ctx.moveTo(128, 22);
    ctx.lineTo(238, 140);
    ctx.lineTo(198, 188);
    ctx.lineTo(128, 116);
    ctx.lineTo(58, 188);
    ctx.lineTo(18, 140);
    ctx.closePath();

    const grad = ctx.createLinearGradient(128, 22, 128, 188);
    grad.addColorStop(0, '#38BDF8');
    grad.addColorStop(1, '#0284C7');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(128, 40);
    ctx.lineTo(218, 136);
    ctx.lineTo(194, 168);
    ctx.lineTo(128, 104);
    ctx.lineTo(62, 168);
    ctx.lineTo(38, 136);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();

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

      const cam = this.el.sceneEl.camera;
      if (!cam) return;
      cam.getWorldPosition(this._cp);

      for (const m of this.items) {
        if (!m.wrapEl || !m.wrapEl.object3D) continue;
        m.wrapEl.object3D.getWorldPosition(this._ep);
        const d = this._cp.distanceTo(this._ep);

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
  // A-Frame компонент: Gaze Interactable (БЕЗ паразитных кругов!)
  // ==========================================================================
  AFRAME.registerComponent('gaze-interactable', {
    schema: {
      duration:  { type: 'number', default: GAZE_DUR },
      color:     { type: 'color',  default: '#22D3EE' },
      isArrow:   { type: 'boolean', default: false    }
    },
    init: function () {
      this.timer       = null;
      this._isGazing   = false;
      this._gazeStart  = 0;
      this._texApplied = false;

      this._canvas = document.createElement('canvas');
      this._canvas.width = this._canvas.height = 256;
      this._ctx    = this._canvas.getContext('2d');
      this._texture= new THREE.CanvasTexture(this._canvas);

      // Прогресс-слой поверх элемента (строго по его форме)
      const s = this.data.isArrow ? 0.92 : 0.40;
      this._progPlane = document.createElement('a-plane');
      this._progPlane.setAttribute('width',  s);
      this._progPlane.setAttribute('height', s);
      this._progPlane.setAttribute('position', '0 0 0.04');
      this._progPlane.setAttribute('material', {
        shader: 'flat', transparent: true,
        opacity: 1, depthWrite: false, side: 'double'
      });
      this._progPlane.object3D.visible = false;
      this.el.appendChild(this._progPlane);

      const applyTex = () => {
        const mat = this._progPlane.components && this._progPlane.components.material;
        if (mat && mat.material) {
          mat.material.map = this._texture;
          mat.material.transparent = true;
          mat.material.needsUpdate = true;
          this._texApplied = true;
          this._ctx.clearRect(0, 0, 256, 256);
          this._texture.needsUpdate = true;
        }
      };
      if (this._progPlane.hasLoaded) applyTex();
      else this._progPlane.addEventListener('loaded', applyTex);

      this.onEnter = () => { if (window.isVRMode) this._start(); };
      this.onLeave = () => this._reset();
      this.el.addEventListener('mouseenter', this.onEnter);
      this.el.addEventListener('mouseleave', this.onLeave);
    },

    _start: function () {
      this._isGazing  = true;
      this._gazeStart = performance.now();
      if (this._progPlane) this._progPlane.object3D.visible = true;
      this.timer = setTimeout(() => {
        this._reset();
        this.el.emit('action-trigger');
        this.el.emit('click');
      }, this.data.duration);
    },

    _reset: function () {
      this._isGazing = false;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (this._progPlane) this._progPlane.object3D.visible = false;
      if (this._ctx)  {
        this._ctx.clearRect(0, 0, 256, 256);
        if (this._texture) this._texture.needsUpdate = true;
      }
    },

    tick: function () {
      if (!this._isGazing || !this._texApplied) return;

      const progress = Math.min((performance.now() - this._gazeStart) / this.data.duration, 1);
      const ctx = this._ctx;
      const SZ = 256;
      ctx.clearRect(0, 0, SZ, SZ);

      if (this.data.isArrow) {
        // Заполнение шеврона снизу вверх (БЕЗ кругов!)
        if (progress > 0.01) {
          ctx.save();
          // Маска по контуру шеврона
          ctx.beginPath();
          ctx.moveTo(128, 22);
          ctx.lineTo(238, 140);
          ctx.lineTo(198, 188);
          ctx.lineTo(128, 116);
          ctx.lineTo(58, 188);
          ctx.lineTo(18, 140);
          ctx.closePath();
          ctx.clip();

          // Неоновая заливка прогресса снизу вверх
          const fillH = 170 * progress;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.fillRect(0, 192 - fillH, SZ, fillH);
          ctx.restore();
        }
      } else {
        // Для круглого экспоната — дуга заполнения
        const CX = 128, CY = 128, R = 96, LW = 16;
        ctx.beginPath();
        ctx.arc(CX, CY, R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = LW;
        ctx.stroke();

        if (progress > 0.005) {
          ctx.beginPath();
          ctx.arc(CX, CY, R, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2, false);
          ctx.strokeStyle = this.data.color;
          ctx.lineWidth = LW;
          ctx.lineCap = 'round';
          ctx.shadowColor = this.data.color;
          ctx.shadowBlur = 14;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      this._texture.needsUpdate = true;
    },

    remove: function () {
      if (this.timer) clearTimeout(this.timer);
      this.el.removeEventListener('mouseenter', this.onEnter);
      this.el.removeEventListener('mouseleave', this.onLeave);
      if (this._progPlane && this._progPlane.parentNode) this._progPlane.parentNode.removeChild(this._progPlane);
    }
  });

  // ==========================================================================
  // Сенсорное управление камерой 360°
  // ==========================================================================
  function setupTouch360() {
    const camera = document.getElementById('main-camera');
    if (!camera) return;
    let active = false, lx = 0, ly = 0;
    const SENS = 0.27;

    window.addEventListener('touchstart', e => {
      if (window.isVRMode || e.touches.length !== 1) return;
      if (e.target.closest('#debug-panel,#debug-toggle-btn,#vr-modal,#exhibit-overlay')) return;
      active = true; lx = e.touches[0].clientX; ly = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (window.isVRMode || !active || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lx;
      const dy = e.touches[0].clientY - ly;
      lx = e.touches[0].clientX; ly = e.touches[0].clientY;
      currentYaw  -= dx * SENS;
      currentPitch = Math.max(-85, Math.min(85, currentPitch + dy * SENS));
      camera.object3D.rotation.set(
        THREE.MathUtils.degToRad(currentPitch),
        THREE.MathUtils.degToRad(currentYaw),
        0, 'YXZ'
      );
    }, { passive: true });

    const end = () => { active = false; };
    window.addEventListener('touchend',    end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
  }

  // ==========================================================================
  // HTML карточка экспоната (non-VR)
  // ==========================================================================
  function showHTMLModal(exhibit, parentWrap) {
    closeHTMLModal();
    activeModalWrap = parentWrap;

    const mesh  = parentWrap.querySelector('.marker-mesh');
    const label = parentWrap.querySelector('.marker-label');
    if (mesh)  { mesh.setAttribute('visible', 'false'); mesh.classList.remove('clickable'); }
    if (label) label.setAttribute('visible', 'false');

    const overlay   = document.getElementById('exhibit-overlay');
    const titleEl   = document.getElementById('exhibit-modal-title');
    const descEl    = document.getElementById('exhibit-desc');
    const imgEl     = document.getElementById('exhibit-img');
    const imgWrap   = document.getElementById('exhibit-img-wrap');

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
    if (activeModalWrap) {
      const mesh = activeModalWrap.querySelector('.marker-mesh');
      if (mesh) { mesh.setAttribute('visible', 'true'); mesh.classList.add('clickable'); }
      activeModalWrap = null;
    }
  }

  // ==========================================================================
  // 3D карточка экспоната (VR Cardboard)
  // ==========================================================================
  function showModal3D(exhibit, parentWrap) {
    closeModal3D();
    activeModalWrap = parentWrap;

    const mc = document.getElementById('modal-container');
    if (!mc) return;

    const mesh  = parentWrap.querySelector('.marker-mesh');
    const label = parentWrap.querySelector('.marker-label');
    if (mesh)  { mesh.setAttribute('visible', 'false'); mesh.classList.remove('clickable'); }
    if (label) label.setAttribute('visible', 'false');

    const modal = document.createElement('a-entity');
    modal.setAttribute('position', parentWrap.getAttribute('position'));
    modal.setAttribute('look-at', '[camera]');
    modal.setAttribute('scale', '0.01 0.01 0.01');
    modal.setAttribute('animation', 'property:scale; to:1 1 1; dur:180; easing:easeOutBack');

    const hasImg = !!exhibit.image;
    const planeW = 2.8, planeH = hasImg ? 2.8 : 1.4;

    const plane = document.createElement('a-plane');
    plane.setAttribute('width', planeW);
    plane.setAttribute('height', planeH);
    plane.setAttribute('material', 'shader:flat; transparent:true; opacity:1');

    const closeBtn = document.createElement('a-circle');
    closeBtn.classList.add('clickable');
    closeBtn.setAttribute('radius', '0.22');
    closeBtn.setAttribute('material', 'color:#EF4444; shader:flat');
    closeBtn.setAttribute('position', `${planeW / 2 - 0.14} ${planeH / 2 - 0.14} 0.05`);
    closeBtn.setAttribute('gaze-interactable', `duration:${GAZE_DUR}; color:#EF4444; isArrow:false`);

    const closeX = document.createElement('a-text');
    closeX.setAttribute('value', '✕');
    closeX.setAttribute('align', 'center');
    closeX.setAttribute('position', '0 0 0.01');
    closeX.setAttribute('color', '#FFF');
    closeX.setAttribute('scale', '1.3 1.3 1.3');
    closeBtn.appendChild(closeX);

    closeBtn.addEventListener('click', closeModal3D);
    closeBtn.addEventListener('action-trigger', closeModal3D);

    modal.appendChild(plane);
    modal.appendChild(closeBtn);
    mc.appendChild(modal);

    const CW = 2048, CH = hasImg ? 2048 : 1100;
    const canvas = document.createElement('canvas');
    canvas.width = CW; canvas.height = CH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const drawCard = () => {
      ctx.fillStyle = '#0D1117';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, CW, CH, 56);
      else ctx.rect(0, 0, CW, CH);
      ctx.fill();

      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 8;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(4, 4, CW - 8, CH - 8, 52);
      else ctx.rect(4, 4, CW - 8, CH - 8);
      ctx.stroke();

      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(0, 0, CW, 22);

      const baseY = hasImg ? 1040 : 100;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      ctx.font = 'bold 44px sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.fillText('🏛  ЭКСПОНАТ МУЗЕЯ', 90, baseY + 60);

      ctx.font = 'bold 96px sans-serif';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(exhibit.title || '', 90, baseY + 180);

      ctx.strokeStyle = 'rgba(245,158,11,0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(90, baseY + 220);
      ctx.lineTo(CW - 90, baseY + 220);
      ctx.stroke();

      ctx.font = '56px sans-serif';
      ctx.fillStyle = '#94A3B8';
      const words = (exhibit.description || '').replace(/<[^>]*>/gm, '').split(' ');
      let line = '', ty = baseY + 330;
      for (const w of words) {
        const test = line + w + ' ';
        if (ctx.measureText(test).width > CW - 180 && line) {
          ctx.fillText(line.trimEnd(), 90, ty);
          line = w + ' '; ty += 82;
        } else { line = test; }
      }
      if (line.trim()) ctx.fillText(line.trimEnd(), 90, ty);

      plane.setAttribute('src', canvas.toDataURL());
    };

    if (hasImg) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        drawCard();
        const imgH = 940;
        const scale = Math.max(CW / img.width, imgH / img.height);
        const dW = img.width * scale, dH = img.height * scale;
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, CW, imgH, [52, 52, 0, 0]);
        else ctx.rect(0, 0, CW, imgH);
        ctx.clip();
        ctx.drawImage(img, (CW - dW) / 2, (imgH - dH) / 2, dW, dH);
        ctx.restore();
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(0, 0, CW, 22);
        plane.setAttribute('src', canvas.toDataURL());
      };
      img.onerror = drawCard;
      img.src = exhibit.image;
    } else {
      drawCard();
    }
  }

  function closeModal3D() {
    const mc = document.getElementById('modal-container');
    if (mc) mc.innerHTML = '';
    if (activeModalWrap) {
      const mesh = activeModalWrap.querySelector('.marker-mesh');
      if (mesh) { mesh.setAttribute('visible', 'true'); mesh.classList.add('clickable'); }
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
    closeModal3D();

    const sceneEl  = document.getElementById('museum-scene');
    const skyCur   = document.getElementById('sky-pano');
    const skyInc   = document.getElementById('sky-pano-incoming');
    const camRig   = document.getElementById('camera-rig');

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
  // Рендеринг содержимого комнаты
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

    // ── Переходы: ТОЛЬКО ЧИСТАЯ СТРЕЛКА-ШЕВРОН (БЕЗ кругов и колец!) ──
    (room.links || []).forEach(lk => {
      const wrap = document.createElement('a-entity');
      wrap.setAttribute('position', lk.position);
      wrap.setAttribute('look-at', '[camera]');

      // Наклон к полу (-65 градусов: стрелка лежит и указывает вперед)
      const arrowTilt = document.createElement('a-entity');
      arrowTilt.setAttribute('rotation', '-65 0 0');

      // Сама стрелка — единственный интерактивный элемент
      const arrow = document.createElement('a-image');
      arrow.classList.add('clickable', 'marker-mesh');
      arrow.setAttribute('src', makeArrowTex());
      arrow.setAttribute('width',  '0.88');
      arrow.setAttribute('height', '0.88');
      arrow.setAttribute('position', '0 0 0.02');
      arrow.setAttribute('material', 'shader:flat; transparent:true; opacity:0.95; depthWrite:false');
      arrow.setAttribute('animation', 'property:position; dir:alternate; dur:1100; loop:true; to:0 0.08 -0.10; easing:easeInOutSine');
      arrow.setAttribute('gaze-interactable', `duration:${GAZE_DUR}; color:#38BDF8; isArrow:true`);

      arrowTilt.appendChild(arrow);

      // Название перехода над стрелкой
      const label = document.createElement('a-image');
      label.classList.add('marker-label');
      label.setAttribute('src', makeLabelTex(lk.label || 'Перейти', false));
      label.setAttribute('width', '1.3');
      label.setAttribute('height', '0.30');
      label.setAttribute('position', '0 0.52 0');
      label.setAttribute('material', 'shader:flat; transparent:true; opacity:0.95');
      label.object3D.visible = true;

      const go = () => transitionToRoom(lk.target, lk.position);
      arrow.addEventListener('click',          go);
      arrow.addEventListener('action-trigger', go);

      // Hover
      const item = prox ? prox.add(wrap, arrowTilt, label, LNK_NEAR, LNK_FAR) : null;
      arrow.addEventListener('mouseenter', () => { if (item) item.isHovered = true; });
      arrow.addEventListener('mouseleave', () => { if (item) item.isHovered = false; });

      wrap.appendChild(arrowTilt);
      wrap.appendChild(label);
      lC.appendChild(wrap);
    });

    // ── Экспонаты ──
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
      circle.setAttribute('gaze-interactable', `duration:${GAZE_DUR}; color:#F59E0B; isArrow:false`);

      const dot = document.createElement('a-circle');
      dot.setAttribute('radius', '0.055');
      dot.setAttribute('position', '0 0 0.01');
      dot.setAttribute('material', 'color:#FFFFFF; shader:flat');
      circle.appendChild(dot);
      meshWrap.appendChild(circle);

      // Название над маркером (видно сразу)
      const label = document.createElement('a-image');
      label.classList.add('marker-label');
      label.setAttribute('src', makeLabelTex(ex.title, true));
      label.setAttribute('width', '1.25');
      label.setAttribute('height', '0.28');
      label.setAttribute('position', '0 0.28 0.02');
      label.setAttribute('material', 'shader:flat; transparent:true; opacity:0.95');
      label.object3D.visible = true;

      const doOpen = () => {
        if (window.isVRMode) showModal3D(ex, wrap);
        else showHTMLModal(ex, wrap);
      };
      circle.addEventListener('click',          doOpen);
      circle.addEventListener('action-trigger', doOpen);

      const item = prox ? prox.add(wrap, meshWrap, label, EX_NEAR, EX_FAR) : null;
      circle.addEventListener('mouseenter', () => { if (item) item.isHovered = true; });
      circle.addEventListener('mouseleave', () => { if (item) item.isHovered = false; });

      wrap.appendChild(meshWrap);
      wrap.appendChild(label);
      eC.appendChild(wrap);
    });

    hideLoadingScreen();
  }

  // ==========================================================================
  // VR режим с предварительным запросом разрешения на датчики положения
  // ==========================================================================
  function setupVR() {
    const sceneEl   = document.querySelector('a-scene');
    const vrBtn     = document.getElementById('custom-vr-btn');
    const vrModal   = document.getElementById('vr-modal');
    const startBtn  = document.getElementById('vr-start-btn');
    const cancelBtn = document.getElementById('vr-cancel-btn');
    const statusEl  = document.getElementById('vr-permission-status');
    const camera    = document.getElementById('main-camera');
    const mCursor   = document.getElementById('mouse-cursor');
    const vrCursor  = document.getElementById('vr-cursor');
    const badge     = document.getElementById('device-mode-badge');
    if (!sceneEl) return;

    if (vrBtn) vrBtn.style.display = 'inline-flex';
    if (vrBtn) vrBtn.addEventListener('click', () => {
      if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
      vrModal.style.display = 'flex';
    });
    if (cancelBtn) cancelBtn.addEventListener('click', () => { vrModal.style.display = 'none'; });

    async function requestOrientationAndEnterVR() {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.color = '#38BDF8';
        statusEl.style.background = 'rgba(56,189,248,0.1)';
        statusEl.style.borderColor = 'rgba(56,189,248,0.25)';
        statusEl.textContent = 'Запрос доступа к положению устройства...';
      }

      let permissionGranted = true;

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') permissionGranted = false;
        } catch (e) {
          console.warn('[VR] DeviceOrientationEvent permission error:', e);
          permissionGranted = false;
        }
      }

      if (permissionGranted && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const resM = await DeviceMotionEvent.requestPermission();
          if (resM !== 'granted') permissionGranted = false;
        } catch (e) {
          console.warn('[VR] DeviceMotionEvent permission error:', e);
        }
      }

      if (!permissionGranted) {
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.color = '#EF4444';
          statusEl.style.background = 'rgba(239,68,68,0.12)';
          statusEl.style.borderColor = 'rgba(239,68,68,0.3)';
          statusEl.textContent = '⚠️ Доступ к датчикам положения отклонён. Для осмотра в VR очках включите доступ к датчикам движения в настройках браузера.';
        }
        return;
      }

      if (statusEl) statusEl.style.display = 'none';
      vrModal.style.display = 'none';

      try {
        sceneEl.enterVR();
      } catch (err) {
        console.error('[VR] enterVR error:', err);
      }
    }

    if (startBtn) {
      startBtn.addEventListener('click', requestOrientationAndEnterVR);
    }

    sceneEl.addEventListener('enter-vr', () => {
      window.isVRMode = true;
      if (vrBtn)    vrBtn.style.display = 'none';
      if (camera)   camera.setAttribute('look-controls', 'magicWindowTrackingEnabled:true; touchEnabled:false');
      if (mCursor)  mCursor.setAttribute('raycaster', 'enabled:false');
      if (vrCursor) { vrCursor.setAttribute('visible', 'true'); vrCursor.setAttribute('raycaster', 'enabled:true; objects:.clickable; far:50; interval:20'); }
      if (badge)    badge.textContent = '👓 VR Cardboard';
    });

    sceneEl.addEventListener('exit-vr', () => {
      window.isVRMode = false;
      if (vrBtn)  vrBtn.style.display = 'inline-flex';
      if (camera) {
        const euler = new THREE.Euler().setFromQuaternion(camera.object3D.quaternion, 'YXZ');
        currentPitch = THREE.MathUtils.radToDeg(euler.x);
        currentYaw   = THREE.MathUtils.radToDeg(euler.y);
        camera.setAttribute('look-controls', 'magicWindowTrackingEnabled:false; touchEnabled:false');
      }
      if (vrCursor) { vrCursor.setAttribute('visible', 'false'); vrCursor.setAttribute('raycaster', 'enabled:false'); }
      if (mCursor)  mCursor.setAttribute('raycaster', 'enabled:true');
      if (badge)    badge.textContent = '📱 Мобильный (360°)';
    });
  }

  // ==========================================================================
  // Debug панель
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
      deviceEl.textContent = `📱 ${window.innerWidth}×${window.innerHeight} DPR${window.devicePixelRatio.toFixed(1)}`;
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
    if (closeBtn)  closeBtn.addEventListener('click',  toggle);

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
        currentPitch = 0; currentYaw = 0;
        if (cam) cam.object3D.rotation.set(0, 0, 0, 'YXZ');
      });
    }
    if (vrTestBtn) {
      vrTestBtn.addEventListener('click', () => {
        const s = document.getElementById('museum-scene');
        if (s) { if (s.is('vr-mode')) s.exitVR(); else s.enterVR(); }
      });
    }

    let fc = 0, lt = performance.now();
    AFRAME.registerComponent('mobile-debug-tracker', {
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
    if (sceneEl) sceneEl.setAttribute('mobile-debug-tracker', '');
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
  // Инициализация
  // ==========================================================================
  function initMobile() {
    if (isInitialized) return;
    isInitialized = true;
    console.log('[Музей] Мобильная версия инициализирована');

    document.body.classList.add('is-mobile');

    const camera   = document.getElementById('main-camera');
    if (camera) camera.setAttribute('look-controls', 'magicWindowTrackingEnabled:false; touchEnabled:false');

    const sceneEl = document.getElementById('museum-scene');
    if (sceneEl) sceneEl.setAttribute('proximity-manager', '');

    const closeBtn = document.getElementById('exhibit-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeHTMLModal);
    const overlay = document.getElementById('exhibit-overlay');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeHTMLModal(); });

    setupTouch360();
    setupVR();
    setupDebug();

    let startRoom = window.location.hash.replace('#', '');
    if (!startRoom || !CONFIG.rooms || !CONFIG.rooms[startRoom]) {
      startRoom = (CONFIG && CONFIG.startRoom) || 'room1';
    }

    const startDef = CONFIG.rooms[startRoom];
    if (startDef) {
      const sky = document.getElementById('sky-pano');
      if (sky) sky.setAttribute('src', startDef.panorama);
      const badge = document.getElementById('device-mode-badge');
      if (badge) badge.textContent = '📱 Мобильный (360°)';
      renderRoomContent(startRoom);
    }

    setTimeout(hideLoadingScreen, 6000);
  }

  window.initMuseumTour = initMobile;

  const scene = document.querySelector('a-scene');
  if (scene && scene.hasLoaded) initMobile();
  else if (scene) scene.addEventListener('loaded', initMobile);
})();
