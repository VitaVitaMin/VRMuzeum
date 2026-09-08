// app-pc.js — Логика для ПК (Управление мышью, Google Maps warp-переходы, Debug-панель)
(function () {
  'use strict';

  const ARROW_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22 fill=%22none%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath d=%22M20 70 L 50 30 L 80 70%22 stroke=%22%234ADE80%22 stroke-width=%2212%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E";

  let isInitialized = false;
  let activeModalWrap = null;
  let isTransitioning = false;
  let currentRoomId = '';
  let debugActive = false;

  // Текстура подсказок над маркерами
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

  // Плавный пространственный переход в стиле Google Street View (без черных экранов)
  function transitionToRoom(targetRoomId, targetPositionStr = null) {
    if (isTransitioning || targetRoomId === currentRoomId) return;
    const nextRoom = CONFIG.rooms && CONFIG.rooms[targetRoomId];
    if (!nextRoom) {
      console.warn(`[Музей ПК] Комната "${targetRoomId}" не найдена в CONFIG.`);
      return;
    }

    isTransitioning = true;
    closeModal3D();

    const sceneEl = document.getElementById('museum-scene');
    const skyCurrent = document.getElementById('sky-pano');
    const skyIncoming = document.getElementById('sky-pano-incoming');
    const cameraRig = document.getElementById('camera-rig');

    // Определяем вектор движения к целевой точке перехода
    let moveDir = new THREE.Vector3(0, 0, -2);
    if (targetPositionStr) {
      const parts = targetPositionStr.trim().split(/\s+/).map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        moveDir.set(parts[0], parts[1], parts[2]).normalize().multiplyScalar(2.4);
      }
    }

    // Предзагрузка следующей панорамы на второй купол
    if (skyIncoming) {
      skyIncoming.setAttribute('src', nextRoom.panorama);
      skyIncoming.setAttribute('visible', 'true');
      skyIncoming.setAttribute('material', 'opacity: 0; transparent: true');
    }

    // Включаем эффект субпиксельного смаза движения (Google Maps Street View Warp)
    if (sceneEl) sceneEl.classList.add('street-warp-active');

    // Анимация движения камеры вперед к маркеру
    if (cameraRig) {
      cameraRig.setAttribute('animation__warp', {
        property: 'position',
        to: `${moveDir.x} ${moveDir.y} ${moveDir.z}`,
        dur: 480,
        easing: 'easeInQuad'
      });
    }

    // Перекрестное смешивание панорам без затемнения
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

    // Завершение перехода
    setTimeout(() => {
      // Обновляем базовый купол новой панорамой
      if (skyCurrent) {
        skyCurrent.removeAttribute('animation__fadeout');
        skyCurrent.setAttribute('src', nextRoom.panorama);
        skyCurrent.setAttribute('material', 'opacity: 1; transparent: true');
      }

      // Скрываем входящий купол
      if (skyIncoming) {
        skyIncoming.removeAttribute('animation__fadein');
        skyIncoming.setAttribute('visible', 'false');
        skyIncoming.setAttribute('material', 'opacity: 0');
      }

      // Возвращаем камеру в центр новой комнаты
      if (cameraRig) {
        cameraRig.removeAttribute('animation__warp');
        cameraRig.setAttribute('position', '0 0 0');
      }

      if (sceneEl) sceneEl.classList.remove('street-warp-active');

      // Отрисовываем объекты новой комнаты
      renderRoomContent(targetRoomId);
      isTransitioning = false;
    }, 500);
  }

  // Отрисовка маркеров и переходов в комнате
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

    // Переходы (Links)
    if (Array.isArray(room.links)) {
      room.links.forEach(lk => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', lk.position);
        wrap.setAttribute('look-at', '[camera]');

        const marker = document.createElement('a-image');
        marker.classList.add('clickable');
        marker.setAttribute('src', ARROW_SVG);
        marker.setAttribute('scale', '0.55 0.55 0.55');
        marker.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 0.95');
        marker.setAttribute('animation', 'property: position; dir: alternate; dur: 900; loop: true; to: 0 0.12 0; easing: easeInOutSine');

        const label = document.createElement('a-image');
        label.classList.add('marker-label');
        label.setAttribute('src', createTextTexture(lk.label || 'Перейти', '#4ADE80', false));
        label.setAttribute('position', '0 0.5 0');
        label.setAttribute('scale', '1.6 0.38 1');
        label.setAttribute('visible', 'false');

        marker.addEventListener('mouseenter', () => {
          label.setAttribute('visible', 'true');
          marker.setAttribute('scale', '0.65 0.65 0.65');
        });
        marker.addEventListener('mouseleave', () => {
          label.setAttribute('visible', 'false');
          marker.setAttribute('scale', '0.55 0.55 0.55');
        });

        marker.addEventListener('click', () => {
          transitionToRoom(lk.target, lk.position);
        });

        wrap.appendChild(marker);
        wrap.appendChild(label);
        linksContainer.appendChild(wrap);
      });
    }

    // Экспонаты (Exhibits)
    if (Array.isArray(room.exhibits)) {
      room.exhibits.forEach(ex => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', ex.position);
        wrap.setAttribute('look-at', '[camera]');

        const marker = document.createElement('a-circle');
        marker.classList.add('clickable', 'marker-mesh');
        marker.setAttribute('radius', '0.1');
        marker.setAttribute('material', 'color: #FFA726; shader: flat; transparent: true; opacity: 0.9');
        marker.setAttribute('animation', 'property: scale; dir: alternate; dur: 1000; loop: true; to: 1.2 1.2 1.2; easing: easeInOutSine');

        const innerDot = document.createElement('a-circle');
        innerDot.setAttribute('radius', '0.04');
        innerDot.setAttribute('position', '0 0 0.01');
        innerDot.setAttribute('material', 'color: #FFFFFF; shader: flat');
        marker.appendChild(innerDot);

        const label = document.createElement('a-image');
        label.classList.add('marker-label');
        label.setAttribute('src', createTextTexture(ex.title, '#FFFFFF', true));
        label.setAttribute('position', '0 0.38 0');
        label.setAttribute('scale', '1.6 0.38 1');
        label.setAttribute('visible', 'false');

        marker.addEventListener('mouseenter', () => {
          label.setAttribute('visible', 'true');
        });
        marker.addEventListener('mouseleave', () => {
          label.setAttribute('visible', 'false');
        });

        marker.addEventListener('click', () => {
          showModal3D(ex, wrap);
        });

        wrap.appendChild(marker);
        wrap.appendChild(label);
        exhibitsContainer.appendChild(wrap);
      });
    }
  }

  // 3D Информационная карточка экспоната
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

    // Кнопка закрытия [X]
    const closeBtn = document.createElement('a-circle');
    closeBtn.classList.add('clickable');
    closeBtn.setAttribute('radius', '0.14');
    closeBtn.setAttribute('material', 'color: #EF4444; shader: flat');
    closeBtn.setAttribute('position', `${planeWidth / 2 - 0.08} ${planeHeight / 2 - 0.08} 0.05`);

    const closeText = document.createElement('a-text');
    closeText.setAttribute('value', '✕');
    closeText.setAttribute('align', 'center');
    closeText.setAttribute('position', '0 0 0.01');
    closeText.setAttribute('color', '#FFFFFF');

    closeBtn.appendChild(closeText);
    closeBtn.addEventListener('click', closeModal3D);

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

  // Настройка служебной панели DEBUG (скрытый функционал для разработчика)
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
      deviceVal.innerText = `ПК (${window.innerWidth}x${window.innerHeight}, DPR ${window.devicePixelRatio.toFixed(1)})`;
    }

    // Заполняем список комнат для быстрого перехода
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

    // Открытие / закрытие панели
    const toggleDebug = () => {
      debugActive = !debugActive;
      if (debugPanel) debugPanel.style.display = debugActive ? 'block' : 'none';
    };

    if (debugBtn) debugBtn.addEventListener('click', toggleDebug);
    if (closeBtn) closeBtn.addEventListener('click', toggleDebug);

    // Копирование координат точки взгляда для config.js
    if (copyBtn && coordVal) {
      copyBtn.addEventListener('click', () => {
        const textToCopy = coordVal.innerText.trim();
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            copyBtn.classList.add('copied');
            copyBtn.innerText = '✅ Скопировано в буфер!';
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              copyBtn.innerText = '📋 Скопировать для config.js';
            }, 1800);
          })
          .catch(() => {
            // Резервный метод копирования
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

    // Сброс камеры
    if (resetCamBtn) {
      resetCamBtn.addEventListener('click', () => {
        const cam = document.getElementById('main-camera');
        if (cam) {
          cam.setAttribute('rotation', '0 0 0');
        }
      });
    }

    // Тест VR в окне
    if (testVrBtn) {
      testVrBtn.addEventListener('click', () => {
        const scene = document.getElementById('museum-scene');
        if (scene) {
          if (scene.is('vr-mode')) scene.exitVR();
          else scene.enterVR();
        }
      });
    }

    // Регистрация компонента отслеживания для Debug (FPS, углы, координаты)
    let frameCount = 0;
    let lastTime = performance.now();
    let currentFps = 60;

    AFRAME.registerComponent('pc-debug-tracker', {
      init: function () {
        this.dir = new THREE.Vector3();
        this.pos = new THREE.Vector3();
        this.rot = new THREE.Euler();
      },
      tick: function () {
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

        // Координаты на расстоянии 3 метра
        camera.getWorldDirection(this.dir);
        this.dir.multiplyScalar(-3.0);
        camera.getWorldPosition(this.pos);
        this.pos.add(this.dir);

        if (coordVal) {
          coordVal.innerText = `${this.pos.x.toFixed(2)} ${this.pos.y.toFixed(2)} ${this.pos.z.toFixed(2)}`;
        }

        // Углы поворота
        if (anglesVal) {
          this.rot.setFromRotationMatrix(camera.matrixWorld, 'YXZ');
          const yaw = Math.round(THREE.MathUtils.radToDeg(this.rot.y));
          const pitch = Math.round(THREE.MathUtils.radToDeg(this.rot.x));
          anglesVal.innerText = `Y: ${yaw}° / P: ${pitch}°`;
        }
      }
    });

    const sceneEl = document.getElementById('museum-scene');
    if (sceneEl) sceneEl.setAttribute('pc-debug-tracker', '');
  }

  // Главная инициализация ПК
  function initPC() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('[Музей ПК] Запуск версии для ПК с плавными переходами и панелью Debug...');

    const camera = document.getElementById('main-camera');
    if (camera) {
      camera.setAttribute('look-controls', 'magicWindowTrackingEnabled: false; touchEnabled: false; reverseMouseDrag: true');
    }

    const vrBtn = document.getElementById('custom-vr-btn');
    if (vrBtn) vrBtn.style.display = 'none';

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal3D();
      if (e.key === '`' || e.key === 'ё') {
        const btn = document.getElementById('debug-toggle-btn');
        if (btn) btn.click();
      }
    });

    setupDebugSystem();

    let startRoom = window.location.hash.replace('#', '');
    if (!startRoom || !CONFIG.rooms || !CONFIG.rooms[startRoom]) {
      startRoom = (CONFIG && CONFIG.startRoom) || 'room1';
    }

    // Первичная загрузка без рывков
    const initialRoom = CONFIG.rooms[startRoom];
    if (initialRoom) {
      const sky = document.getElementById('sky-pano');
      if (sky) sky.setAttribute('src', initialRoom.panorama);
      renderRoomContent(startRoom);
    }
  }

  window.initMuseumTour = initPC;

  const sceneEl = document.querySelector('a-scene');
  if (sceneEl && sceneEl.hasLoaded) {
    initPC();
  } else if (sceneEl) {
    sceneEl.addEventListener('loaded', initPC);
  }
})();
