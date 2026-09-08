// app-mobile.js — Мобильная версия: свободный обзор 360° (свайп по горизонтали и вертикали), Cardboard VR с гироскопом, таймер 3 сек, Google Maps warp, Debug-панель
(function () {
  'use strict';

  const ARROW_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22 fill=%22none%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath d=%22M20 70 L 50 30 L 80 70%22 stroke=%22%234ADE80%22 stroke-width=%2212%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E";

  let isInitialized = false;
  let activeModalWrap = null;
  let isTransitioning = false;
  let currentRoomId = '';
  let debugActive = false;
  window.isVRMode = false;

  let gyroControls = null;
  let currentPitch = 0; // Наклон вверх/вниз в градусах (-85° .. +85°)
  let currentYaw = 0;   // Поворот влево/вправо в градусах (0 .. 360°)

  // Компонент взаимодействия взглядом (Gaze Interaction) для Google Cardboard — ровно 3 секунды
  AFRAME.registerComponent('gaze-interactable', {
    schema: {
      duration: { type: 'number', default: 3000 }, // 3.0 секунды
      color: { type: 'color', default: '#4ADE80' }
    },
    init: function () {
      this.timer = null;
      this.progressBar = document.getElementById('vr-cursor-progress');

      this.onMouseEnter = () => {
        if (!window.isVRMode) return;

        // Запуск кругового индикатора в прицеле
        if (this.progressBar) {
          this.progressBar.setAttribute('visible', 'true');
          this.progressBar.setAttribute('material', `color: ${this.data.color}; shader: flat; transparent: true; opacity: 0.95`);
          this.progressBar.setAttribute('animation__fill', {
            property: 'scale',
            from: '0.1 0.1 0.1',
            to: '1.25 1.25 1.25',
            dur: this.data.duration,
            easing: 'linear'
          });
        }

        // Таймер задержки на 3 секунды
        this.timer = setTimeout(() => {
          this.resetProgress();
          this.el.emit('action-trigger');
          this.el.emit('click');
        }, this.data.duration);
      };

      this.onMouseLeave = () => {
        this.resetProgress();
      };

      this.resetProgress = () => {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        if (this.progressBar) {
          this.progressBar.removeAttribute('animation__fill');
          this.progressBar.setAttribute('scale', '1 1 1');
          this.progressBar.setAttribute('visible', 'false');
        }
      };

      this.el.addEventListener('mouseenter', this.onMouseEnter);
      this.el.addEventListener('mouseleave', this.onMouseLeave);
    },
    remove: function () {
      if (this.timer) clearTimeout(this.timer);
      this.el.removeEventListener('mouseenter', this.onMouseEnter);
      this.el.removeEventListener('mouseleave', this.onMouseLeave);
    }
  });

  // Полноценное сенсорное управление обзором на 360° (по горизонтали И вертикали)
  function setupMobileTouch360() {
    const sceneEl = document.getElementById('museum-scene');
    const camera = document.getElementById('main-camera');
    if (!sceneEl || !camera) return;

    let isTouching = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let totalDist = 0;
    const SENSITIVITY = 0.28;

    const onTouchStart = (e) => {
      if (window.isVRMode) return;
      if (e.touches.length === 1) {
        // Игнорируем тачи по панели дебага или модалке
        if (e.target.closest('#debug-panel') || e.target.closest('#debug-toggle-btn') || e.target.closest('#vr-modal')) {
          return;
        }
        isTouching = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        lastX = startX;
        lastY = startY;
        totalDist = 0;
      }
    };

    const onTouchMove = (e) => {
      if (window.isVRMode || !isTouching || e.touches.length !== 1) return;

      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;

      const deltaX = clientX - lastX;
      const deltaY = clientY - lastY;

      lastX = clientX;
      lastY = clientY;
      totalDist += Math.hypot(deltaX, deltaY);

      // Вращение по горизонтали (Yaw 360°)
      currentYaw -= deltaX * SENSITIVITY;

      // Вращение по вертикали (Pitch вверх / вниз с ограничением -85° .. +85°)
      currentPitch += deltaY * SENSITIVITY;
      currentPitch = Math.max(-85, Math.min(85, currentPitch));

      // Применяем вращение к камере в формате YXZ
      camera.object3D.rotation.set(
        THREE.MathUtils.degToRad(currentPitch),
        THREE.MathUtils.degToRad(currentYaw),
        0,
        'YXZ'
      );
    };

    const onTouchEnd = () => {
      isTouching = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }

  // Текстура плашек над маркерами
  function createTextTexture(text, textColor = '#FFFFFF', isExhibit = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(16, 16, canvas.width - 32, canvas.height - 32, 28);
    else ctx.rect(16, 16, canvas.width - 32, canvas.height - 32);
    ctx.fill();

    ctx.strokeStyle = isExhibit ? 'rgba(255, 167, 38, 0.8)' : 'rgba(74, 222, 128, 0.8)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    return canvas.toDataURL();
  }

  // Плавный пространственный переход Google Maps Street View (без черных экранов)
  function transitionToRoom(targetRoomId, targetPositionStr = null) {
    if (isTransitioning || targetRoomId === currentRoomId) return;
    const nextRoom = CONFIG.rooms && CONFIG.rooms[targetRoomId];
    if (!nextRoom) return;

    isTransitioning = true;
    closeModal3D();

    const sceneEl = document.getElementById('museum-scene');
    const skyCurrent = document.getElementById('sky-pano');
    const skyIncoming = document.getElementById('sky-pano-incoming');
    const cameraRig = document.getElementById('camera-rig');

    // Направление движения к маркеру
    let moveDir = new THREE.Vector3(0, 0, -2);
    if (targetPositionStr) {
      const parts = targetPositionStr.trim().split(/\s+/).map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        moveDir.set(parts[0], parts[1], parts[2]).normalize().multiplyScalar(2.2);
      }
    }

    if (skyIncoming) {
      skyIncoming.setAttribute('src', nextRoom.panorama);
      skyIncoming.setAttribute('visible', 'true');
      skyIncoming.setAttribute('material', 'opacity: 0; transparent: true');
    }

    if (sceneEl) sceneEl.classList.add('street-warp-active');

    if (cameraRig) {
      cameraRig.setAttribute('animation__warp', {
        property: 'position',
        to: `${moveDir.x} ${moveDir.y} ${moveDir.z}`,
        dur: 480,
        easing: 'easeInQuad'
      });
    }

    if (skyCurrent) {
      skyCurrent.setAttribute('animation__fadeout', {
        property: 'material.opacity',
        from: 1,
        to: 0,
        dur: 480,
        easing: 'easeInQuad'
      });
    }

    if (skyIncoming) {
      skyIncoming.setAttribute('animation__fadein', {
        property: 'material.opacity',
        from: 0,
        to: 1,
        dur: 480,
        easing: 'easeInQuad'
      });
    }

    setTimeout(() => {
      if (skyCurrent) {
        skyCurrent.removeAttribute('animation__fadeout');
        skyCurrent.setAttribute('src', nextRoom.panorama);
        skyCurrent.setAttribute('material', 'opacity: 1; transparent: true');
      }

      if (skyIncoming) {
        skyIncoming.removeAttribute('animation__fadein');
        skyIncoming.setAttribute('visible', 'false');
        skyIncoming.setAttribute('material', 'opacity: 0');
      }

      if (cameraRig) {
        cameraRig.removeAttribute('animation__warp');
        cameraRig.setAttribute('position', '0 0 0');
      }

      if (sceneEl) sceneEl.classList.remove('street-warp-active');

      renderRoomContent(targetRoomId);
      isTransitioning = false;
    }, 500);
  }

  // Отрисовка маркеров в комнате
  function renderRoomContent(roomId) {
    currentRoomId = roomId;
    const room = CONFIG.rooms && CONFIG.rooms[roomId];
    if (!room) return;

    window.history.replaceState(null, null, '#' + roomId);

    const roomTitle = document.getElementById('room-title');
    if (roomTitle) roomTitle.innerText = room.name || 'Зал музея';

    const debugRoomField = document.getElementById('debug-current-room');
    if (debugRoomField) debugRoomField.innerText = roomId;

    const debugRoomSelect = document.getElementById('debug-room-select');
    if (debugRoomSelect && debugRoomSelect.value !== roomId) {
      debugRoomSelect.value = roomId;
    }

    const linksContainer = document.getElementById('links-container');
    const exhibitsContainer = document.getElementById('exhibits-container');

    if (linksContainer) linksContainer.innerHTML = '';
    if (exhibitsContainer) exhibitsContainer.innerHTML = '';

    // Стрелки переходов
    if (Array.isArray(room.links)) {
      room.links.forEach(lk => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', lk.position);
        wrap.setAttribute('look-at', '[camera]');

        const marker = document.createElement('a-image');
        marker.classList.add('clickable');
        marker.setAttribute('src', ARROW_SVG);
        marker.setAttribute('scale', '0.6 0.6 0.6');
        marker.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 0.95');
        marker.setAttribute('animation', 'property: position; dir: alternate; dur: 900; loop: true; to: 0 0.12 0; easing: easeInOutSine');
        marker.setAttribute('gaze-interactable', 'duration: 3000; color: #4ADE80');

        const label = document.createElement('a-image');
        label.classList.add('marker-label');
        label.setAttribute('src', createTextTexture(lk.label || 'Перейти', '#4ADE80', false));
        label.setAttribute('position', '0 0.52 0');
        label.setAttribute('scale', '1.6 0.38 1');
        label.setAttribute('visible', 'true');

        const doJump = () => transitionToRoom(lk.target, lk.position);
        marker.addEventListener('click', doJump);
        marker.addEventListener('action-trigger', doJump);

        wrap.appendChild(marker);
        wrap.appendChild(label);
        linksContainer.appendChild(wrap);
      });
    }

    // Экспонаты
    if (Array.isArray(room.exhibits)) {
      room.exhibits.forEach(ex => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', ex.position);
        wrap.setAttribute('look-at', '[camera]');

        const marker = document.createElement('a-circle');
        marker.classList.add('clickable', 'marker-mesh');
        marker.setAttribute('radius', '0.12');
        marker.setAttribute('material', 'color: #FFA726; shader: flat; transparent: true; opacity: 0.95');
        marker.setAttribute('animation', 'property: scale; dir: alternate; dur: 1000; loop: true; to: 1.25 1.25 1.25; easing: easeInOutSine');
        marker.setAttribute('gaze-interactable', 'duration: 3000; color: #FFA726');

        const innerDot = document.createElement('a-circle');
        innerDot.setAttribute('radius', '0.05');
        innerDot.setAttribute('position', '0 0 0.01');
        innerDot.setAttribute('material', 'color: #FFFFFF; shader: flat');
        marker.appendChild(innerDot);

        const label = document.createElement('a-image');
        label.classList.add('marker-label');
        label.setAttribute('src', createTextTexture(ex.title, '#FFFFFF', true));
        label.setAttribute('position', '0 0.4 0');
        label.setAttribute('scale', '1.6 0.38 1');
        label.setAttribute('visible', 'true');

        const doOpen = () => showModal3D(ex, wrap);
        marker.addEventListener('click', doOpen);
        marker.addEventListener('action-trigger', doOpen);

        wrap.appendChild(marker);
        wrap.appendChild(label);
        exhibitsContainer.appendChild(wrap);
      });
    }
  }

  // 3D Карточка экспоната
  function showModal3D(exhibit, parentWrap) {
    closeModal3D();
    activeModalWrap = parentWrap;

    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    const markerMesh = parentWrap.querySelector('.marker-mesh');
    const label = parentWrap.querySelector('.marker-label');
    if (markerMesh) {
      markerMesh.setAttribute('visible', 'false');
      markerMesh.classList.remove('clickable');
    }
    if (label) label.setAttribute('visible', 'false');

    const modal = document.createElement('a-entity');
    const pos = parentWrap.getAttribute('position');
    modal.setAttribute('position', pos);
    modal.setAttribute('look-at', '[camera]');
    modal.setAttribute('scale', '0.01 0.01 0.01');
    modal.setAttribute('animation', 'property: scale; to: 1 1 1; dur: 350; easing: easeOutCubic');

    const planeWidth = 2.8;
    const planeHeight = exhibit.image ? 2.8 : 1.5;

    const modalPlane = document.createElement('a-plane');
    modalPlane.setAttribute('width', planeWidth);
    modalPlane.setAttribute('height', planeHeight);
    modalPlane.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 1');

    // Кнопка закрытия [X] (3 секунды задержки в Cardboard)
    const closeBtn = document.createElement('a-circle');
    closeBtn.classList.add('clickable');
    closeBtn.setAttribute('radius', '0.15');
    closeBtn.setAttribute('material', 'color: #EF4444; shader: flat');
    closeBtn.setAttribute('position', `${planeWidth / 2 - 0.08} ${planeHeight / 2 - 0.08} 0.05`);
    closeBtn.setAttribute('gaze-interactable', 'duration: 3000; color: #EF4444');

    const closeText = document.createElement('a-text');
    closeText.setAttribute('value', '✕');
    closeText.setAttribute('align', 'center');
    closeText.setAttribute('position', '0 0 0.01');
    closeText.setAttribute('color', '#FFFFFF');
    closeText.setAttribute('scale', '1.1 1.1 1.1');

    closeBtn.appendChild(closeText);
    closeBtn.addEventListener('click', closeModal3D);
    closeBtn.addEventListener('action-trigger', closeModal3D);

    modal.appendChild(modalPlane);
    modal.appendChild(closeBtn);
    modalContainer.appendChild(modal);

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = exhibit.image ? 2048 : 1100;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const renderCard = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#161925';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, canvas.width, canvas.height, 48);
      else ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.fill();

      ctx.fillStyle = '#FFA726';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, canvas.width, 16, [48, 48, 0, 0]);
      else ctx.rect(0, 0, canvas.width, 16);
      ctx.fill();

      ctx.strokeStyle = '#2A3048';
      ctx.lineWidth = 8;
      ctx.stroke();

      const contentStartY = exhibit.image ? 1040 : 180;

      ctx.font = 'bold 44px sans-serif';
      ctx.fillStyle = '#FFA726';
      ctx.fillText('🏛  ЭКСПОНАТ МУЗЕЯ', 100, contentStartY);

      ctx.font = 'bold 92px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(exhibit.title || 'Без названия', 100, contentStartY + 110);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(100, contentStartY + 150);
      ctx.lineTo(canvas.width - 100, contentStartY + 150);
      ctx.stroke();

      ctx.font = '54px sans-serif';
      ctx.fillStyle = '#E2E8F0';
      const rawText = (exhibit.description || '').replace(/<[^>]*>?/gm, '');
      const words = rawText.split(' ');
      let line = '';
      let textY = contentStartY + 240;
      const maxWidth = canvas.width - 200;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line, 100, textY);
          line = words[i] + ' ';
          textY += 76;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 100, textY);

      modalPlane.setAttribute('src', canvas.toDataURL());
    };

    if (exhibit.image) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        renderCard();

        const targetW = canvas.width;
        const targetH = 920;
        const scale = Math.max(targetW / img.width, targetH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const drawX = (targetW - drawW) / 2;
        const drawY = (targetH - drawH) / 2;

        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, targetW, targetH, [48, 48, 0, 0]);
        else ctx.rect(0, 0, targetW, targetH);
        ctx.clip();
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();

        ctx.fillStyle = '#FFA726';
        ctx.fillRect(0, 0, targetW, 16);

        modalPlane.setAttribute('src', canvas.toDataURL());
      };
      img.onerror = () => {
        renderCard();
      };
      img.src = exhibit.image;
    } else {
      renderCard();
    }
  }

  function closeModal3D() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) modalContainer.innerHTML = '';

    if (activeModalWrap) {
      const markerMesh = activeModalWrap.querySelector('.marker-mesh');
      if (markerMesh) {
        markerMesh.setAttribute('visible', 'true');
        markerMesh.classList.add('clickable');
      }
      activeModalWrap = null;
    }
  }

  // Настройка режимов: Сенсорный Свайп 360° vs Режим VR Cardboard с гироскопом
  function setupVRModes() {
    const sceneEl = document.querySelector('a-scene');
    const vrBtn = document.getElementById('custom-vr-btn');
    const vrModal = document.getElementById('vr-modal');
    const vrStartBtn = document.getElementById('vr-start-btn');
    const vrCancelBtn = document.getElementById('vr-cancel-btn');
    const camera = document.getElementById('main-camera');
    const mouseCursor = document.getElementById('mouse-cursor');
    const vrCursor = document.getElementById('vr-cursor');
    const modeBadge = document.getElementById('device-mode-badge');

    if (!sceneEl) return;

    // Открытие модального окна перед входом в VR
    if (vrBtn && vrModal) {
      vrBtn.style.display = 'inline-flex';
      vrBtn.addEventListener('click', () => {
        vrModal.style.display = 'flex';
      });
    }

    if (vrCancelBtn && vrModal) {
      vrCancelBtn.addEventListener('click', () => {
        vrModal.style.display = 'none';
      });
    }

    // Запуск Cardboard VR по нажатию «Запустить VR»
    if (vrStartBtn && vrModal) {
      vrStartBtn.addEventListener('click', () => {
        vrModal.style.display = 'none';

        // Запрос разрешения на датчик ориентации (iOS Safari и современный Android)
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission()
            .then(perm => {
              if (perm === 'granted') sceneEl.enterVR();
              else sceneEl.enterVR();
            })
            .catch(() => sceneEl.enterVR());
        } else {
          sceneEl.enterVR();
        }
      });
    }

    // Вход в режим Cardboard VR
    sceneEl.addEventListener('enter-vr', () => {
      window.isVRMode = true;
      console.log('[Музей] Вход в Cardboard VR: активация гироскопа, таймер взгляда 3 сек');

      if (vrBtn) vrBtn.style.display = 'none';

      // Подключаем трехмерный трекинг гироскопа очков
      if (camera && THREE.DeviceOrientationControls) {
        if (!gyroControls) {
          gyroControls = new THREE.DeviceOrientationControls(camera.object3D);
        }
        gyroControls.enabled = true;
        gyroControls.connect();
      }

      // Переключаем курсоры
      if (mouseCursor) mouseCursor.setAttribute('raycaster', 'enabled: false');
      if (vrCursor) {
        vrCursor.setAttribute('visible', 'true');
        vrCursor.setAttribute('raycaster', 'enabled: true');
      }

      if (modeBadge) modeBadge.textContent = '👓 Режим VR Cardboard';
    });

    // Выход из VR в обычный мобильный режим
    sceneEl.addEventListener('exit-vr', () => {
      window.isVRMode = false;
      console.log('[Музей] Выход из VR: возврат к полному сенсорному обзору 360°');

      if (vrBtn) vrBtn.style.display = 'inline-flex';

      if (gyroControls) {
        gyroControls.enabled = false;
        gyroControls.disconnect();
      }

      // Синхронизируем углы тач-обзора с текущей ориентацией камеры
      if (camera) {
        const euler = new THREE.Euler().setFromQuaternion(camera.object3D.quaternion, 'YXZ');
        currentPitch = THREE.MathUtils.radToDeg(euler.x);
        currentYaw = THREE.MathUtils.radToDeg(euler.y);
      }

      if (mouseCursor) mouseCursor.setAttribute('raycaster', 'enabled: true');
      if (vrCursor) {
        vrCursor.setAttribute('visible', 'false');
        vrCursor.setAttribute('raycaster', 'enabled: false');
      }

      if (modeBadge) modeBadge.textContent = '📱 Мобильный (Сенсорный 360°)';
    });
  }

  // Настройка служебной панели DEBUG для мобильных устройств
  function setupDebugSystem() {
    const debugBtn = document.getElementById('debug-toggle-btn');
    const debugPanel = document.getElementById('debug-panel');
    const closeBtn = document.getElementById('debug-close-btn');
    const coordVal = document.getElementById('debug-coord-val');
    const copyBtn = document.getElementById('debug-copy-coords-btn');
    const roomSelect = document.getElementById('debug-room-select');
    const fpsVal = document.getElementById('debug-fps-val');
    const anglesVal = document.getElementById('debug-angles-val');
    const deviceVal = document.getElementById('debug-device-val');
    const resetCamBtn = document.getElementById('debug-reset-cam-btn');
    const testVrBtn = document.getElementById('debug-test-vr-btn');

    if (deviceVal) {
      deviceVal.innerText = `Смартфон (${window.innerWidth}x${window.innerHeight}, DPR ${window.devicePixelRatio.toFixed(1)})`;
    }

    if (roomSelect && CONFIG.rooms) {
      roomSelect.innerHTML = '';
      Object.keys(CONFIG.rooms).forEach(rId => {
        const opt = document.createElement('option');
        opt.value = rId;
        opt.textContent = `${CONFIG.rooms[rId].name || rId} [${rId}]`;
        roomSelect.appendChild(opt);
      });

      roomSelect.addEventListener('change', () => {
        transitionToRoom(roomSelect.value);
      });
    }

    const toggleDebug = () => {
      debugActive = !debugActive;
      if (debugPanel) debugPanel.style.display = debugActive ? 'block' : 'none';
    };

    if (debugBtn) debugBtn.addEventListener('click', toggleDebug);
    if (closeBtn) closeBtn.addEventListener('click', toggleDebug);

    if (copyBtn && coordVal) {
      copyBtn.addEventListener('click', () => {
        const textToCopy = coordVal.innerText.trim();
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            copyBtn.innerText = '✅ Скопировано в буфер!';
            setTimeout(() => {
              copyBtn.innerText = '📋 Скопировать для config.js';
            }, 1800);
          })
          .catch(() => {
            const dummy = document.createElement('textarea');
            dummy.value = textToCopy;
            document.body.appendChild(dummy);
            dummy.select();
            document.execCommand('copy');
            document.body.removeChild(dummy);
            copyBtn.innerText = '✅ Скопировано!';
            setTimeout(() => {
              copyBtn.innerText = '📋 Скопировать для config.js';
            }, 1800);
          });
      });
    }

    if (resetCamBtn) {
      resetCamBtn.addEventListener('click', () => {
        const cam = document.getElementById('main-camera');
        currentPitch = 0;
        currentYaw = 0;
        if (cam) cam.object3D.rotation.set(0, 0, 0);
      });
    }

    if (testVrBtn) {
      testVrBtn.addEventListener('click', () => {
        const scene = document.getElementById('museum-scene');
        if (scene) {
          if (scene.is('vr-mode')) scene.exitVR();
          else scene.enterVR();
        }
      });
    }

    let frameCount = 0;
    let lastTime = performance.now();
    let currentFps = 60;

    AFRAME.registerComponent('mobile-debug-tracker', {
      init: function () {
        this.dir = new THREE.Vector3();
        this.pos = new THREE.Vector3();
        this.rot = new THREE.Euler();
      },
      tick: function () {
        // Обновление ориентации очков в режиме VR
        if (window.isVRMode && gyroControls && gyroControls.enabled) {
          gyroControls.update();
        }

        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 500) {
          currentFps = Math.round((frameCount * 1000) / (now - lastTime));
          frameCount = 0;
          lastTime = now;
          if (debugActive && fpsVal) fpsVal.innerText = `${currentFps} FPS`;
        }

        if (!debugActive) return;

        const camera = this.el.sceneEl && this.el.sceneEl.camera;
        if (!camera) return;

        camera.getWorldDirection(this.dir);
        this.dir.multiplyScalar(-3.0);
        camera.getWorldPosition(this.pos);
        this.pos.add(this.dir);

        if (coordVal) {
          coordVal.innerText = `${this.pos.x.toFixed(2)} ${this.pos.y.toFixed(2)} ${this.pos.z.toFixed(2)}`;
        }

        if (anglesVal) {
          this.rot.setFromRotationMatrix(camera.matrixWorld, 'YXZ');
          const yaw = Math.round(THREE.MathUtils.radToDeg(this.rot.y));
          const pitch = Math.round(THREE.MathUtils.radToDeg(this.rot.x));
          anglesVal.innerText = `Y: ${yaw}° / P: ${pitch}°`;
        }
      }
    });

    const sceneEl = document.getElementById('museum-scene');
    if (sceneEl) sceneEl.setAttribute('mobile-debug-tracker', '');
  }

  // Главная инициализация мобильной версии
  function initMobile() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('[Музей Мобильный] Запуск: свободный сенсорный обзор 360°, Cardboard VR с гироскопом...');

    setupMobileTouch360();
    setupVRModes();
    setupDebugSystem();

    let startRoom = window.location.hash.replace('#', '');
    if (!startRoom || !CONFIG.rooms || !CONFIG.rooms[startRoom]) {
      startRoom = (CONFIG && CONFIG.startRoom) || 'room1';
    }

    const initialRoom = CONFIG.rooms[startRoom];
    if (initialRoom) {
      const sky = document.getElementById('sky-pano');
      if (sky) sky.setAttribute('src', initialRoom.panorama);
      renderRoomContent(startRoom);
    }
  }

  window.initMuseumTour = initMobile;

  const sceneEl = document.querySelector('a-scene');
  if (sceneEl && sceneEl.hasLoaded) {
    initMobile();
  } else if (sceneEl) {
    sceneEl.addEventListener('loaded', initMobile);
  }
})();
