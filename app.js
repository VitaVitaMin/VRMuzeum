// Новый компонент для удержания взгляда (3 секунды)
AFRAME.registerComponent('gaze-interactable', {
  schema: {
    duration: {type: 'number', default: 3000},
    color: {type: 'color', default: '#4CAF50'},
    ringInner: {type: 'number', default: 0.15},
    ringOuter: {type: 'number', default: 0.2}
  },
  init: function () {
    this.hovering = false;
    this.progress = 0;
    
    // Создаем кружок анимации взаимодействия
    this.loaderRing = document.createElement('a-ring');
    this.loaderRing.setAttribute('radius-inner', this.data.ringInner);
    this.loaderRing.setAttribute('radius-outer', this.data.ringOuter);
    this.loaderRing.setAttribute('material', `color: ${this.data.color}; shader: flat; transparent: true; opacity: 0.9; side: double`);
    this.loaderRing.setAttribute('geometry', 'thetaLength: 0');
    // Размещаем чуть-чуть перед объектом
    this.loaderRing.setAttribute('position', '0 0 0.02'); 
    this.loaderRing.setAttribute('visible', 'false');
    
    this.el.appendChild(this.loaderRing);
    
    this.onEnter = () => { 
      if (!window.isVRMode) return; // Только в VR режиме
      this.hovering = true; 
      this.progress = 0; 
      this.loaderRing.setAttribute('visible', 'true');
      // Обратная связь при наведении (увеличение)
      this.el.setAttribute('animation__scale', 'property: scale; to: 1.15 1.15 1.15; dur: 200; easing: easeOutQuad');
    };
    
    this.onLeave = () => { 
      if (!window.isVRMode) return;
      this.resetState();
    };

    this.onClick = () => {
      // В обычном 2D режиме реагируем на клик/свайп мгновенно
      if (!window.isVRMode) {
        this.el.emit('action-trigger');
      }
    };
    
    this.el.addEventListener('mouseenter', this.onEnter);
    this.el.addEventListener('mouseleave', this.onLeave);
    this.el.addEventListener('click', this.onClick);
  },
  resetState: function () {
    this.hovering = false;
    this.progress = 0;
    this.loaderRing.setAttribute('geometry', 'thetaLength: 0');
    this.loaderRing.setAttribute('visible', 'false');
    this.el.setAttribute('animation__scale', 'property: scale; to: 1 1 1; dur: 200; easing: easeOutQuad');
  },
  tick: function (time, timeDelta) {
    if (this.hovering && window.isVRMode) {
      this.progress += timeDelta; // Точное время в миллисекундах (ровно 3 секунды)
      let angle = (this.progress / this.data.duration) * 360;
      if (this.progress >= this.data.duration) {
        this.hovering = false;
        // Триггерим кастомное событие
        this.el.emit('action-trigger'); 
        this.resetState();
      } else {
        this.loaderRing.setAttribute('geometry', `thetaLength: ${angle}`);
      }
    }
  },
  remove: function () {
    this.el.removeEventListener('mouseenter', this.onEnter);
    this.el.removeEventListener('mouseleave', this.onLeave);
    this.el.removeEventListener('click', this.onClick);
  }
});

// Глобальные переменные UI
window.isVRMode = false;
const sky = document.getElementById('sky-pano');
const linksContainer = document.getElementById('links-container');
const exhibitsContainer = document.getElementById('exhibits-container');
const modalContainer = document.getElementById('modal-container');
const roomTitle = document.getElementById('room-title');

// SVG код для стрелочки (закодирован для использования в A-Frame)
const ARROW_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22 fill=%22none%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath d=%22M20 70 L 50 30 L 80 70%22 stroke=%22white%22 stroke-width=%2212%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E";

// Функция переходов с WebGL затемнением (эффект белой вспышки/засветления для плавности)
function triggerTransition(callback) {
  const vrFade = document.getElementById('vr-fade');
  if (!vrFade) { callback(); return; }
  
  // Анимируем появление белого света
  vrFade.setAttribute('animation__fadein', 'property: opacity; from: 0; to: 1; dur: 400; easing: easeInOutQuad');
  
  setTimeout(() => {
    callback(); // Меняем сцену, пока экран залит белым
    
    // Снимаем засветку
    setTimeout(() => {
        vrFade.setAttribute('animation__fadeout', 'property: opacity; from: 1; to: 0; dur: 800; easing: easeInOutQuad');
        vrFade.removeAttribute('animation__fadein');
    }, 100);
  }, 450);
}

// Первая загрузка
let isFirstLoad = true;

// Функция загрузки комнаты
function loadScene(roomId) {
  const room = CONFIG.rooms[roomId];
  if (!room) {
    console.error("Room not found:", roomId);
    return;
  }

  const loadAction = () => {
    // Меняем текстуру неба
    sky.setAttribute('src', room.panorama);
    
    // Обновляем заголовок
    roomTitle.innerText = room.name;

    // Очищаем старые элементы
    linksContainer.innerHTML = '';
    exhibitsContainer.innerHTML = '';
    closeModal3D(); // Закрываем 3D модалки при смене комнаты

    // Генерируем переходы (Ссылки)
    if (room.links) {
      room.links.forEach(lk => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', lk.position);
        wrap.setAttribute('look-at', '[camera]');

        // Сама картинка стрелочки
        const marker = document.createElement('a-image');
        marker.classList.add('clickable');
        marker.setAttribute('src', ARROW_SVG);
        marker.setAttribute('scale', '0.5 0.5 0.5');
        marker.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 0.7');
        // Плавная анимация прыжка вверх-вниз
        marker.setAttribute('animation', 'property: position; dir: alternate; dur: 800; loop: true; to: 0 0.1 0');
        // Добавляем 3х-секундное взаимодействие
        marker.setAttribute('gaze-interactable', 'duration: 3000; color: #4CAF50; ringInner: 0.25; ringOuter: 0.3');

        // Текстовая подпись
        const label = document.createElement('a-text');
        label.classList.add('marker-label');
        label.setAttribute('value', lk.label);
        label.setAttribute('align', 'center');
        label.setAttribute('position', '0 0.4 0');
        label.setAttribute('color', '#4CAF50');
        label.setAttribute('scale', '0.8 0.8 0.8');
        label.setAttribute('visible', 'false');

        // Обработка клика/взгляда - переход
        marker.addEventListener('action-trigger', () => loadScene(lk.target));

        wrap.appendChild(marker);
        wrap.appendChild(label);
        linksContainer.appendChild(wrap);
      });
    }

    // Генерируем экспонаты
    if (room.exhibits) {
      room.exhibits.forEach(ex => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', ex.position);
        wrap.setAttribute('look-at', '[camera]');
        wrap.setAttribute('smart-marker', '');

        // Круглый маркер (hotspot)
        const marker = document.createElement('a-circle');
        marker.classList.add('clickable', 'marker-mesh');
        marker.setAttribute('radius', '0.08');
        marker.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 0.8');
        // Добавляем 3х-секундное взаимодействие
        marker.setAttribute('gaze-interactable', 'duration: 3000; color: #FF9800; ringInner: 0.12; ringOuter: 0.15');

        // Текстовая подпись
        const label = document.createElement('a-text');
        label.classList.add('marker-label');
        label.setAttribute('value', ex.title);
        label.setAttribute('align', 'center');
        label.setAttribute('position', '0 0.25 0');
        label.setAttribute('color', '#FFF');
        label.setAttribute('scale', '0.8 0.8 0.8');
        label.setAttribute('visible', 'false');

        // Обработка клика/взгляда - открытие 3D плашки
        marker.addEventListener('action-trigger', () => {
          showModal3D(ex, wrap);
        });

        wrap.appendChild(marker);
        wrap.appendChild(label);
        exhibitsContainer.appendChild(wrap);
      });
    }
  };

  if (isFirstLoad) {
    // При первой загрузке просто показываем комнату и снимаем пелену
    loadAction();
    setTimeout(() => {
        const vrFade = document.getElementById('vr-fade');
        if (vrFade) {
            vrFade.setAttribute('animation__fadeout', 'property: opacity; from: 1; to: 0; dur: 800; easing: easeInOutQuad');
        }
    }, 1000);
    isFirstLoad = false;
  } else {
    // Делаем плавный переход
    triggerTransition(loadAction);
  }
}

let activeModalWrap = null;

// Функция показа 3D плашки
function showModal3D(exhibit, parentWrap) {
  // Закрываем предыдущую плашку, если есть
  closeModal3D();
  
  activeModalWrap = parentWrap;
  
  // Скрываем маркер и надпись, чтобы не мешали
  const markerMesh = parentWrap.querySelector('.marker-mesh');
  const label = parentWrap.querySelector('.marker-label');
  if (markerMesh) {
    markerMesh.setAttribute('visible', 'false');
    markerMesh.classList.remove('clickable');
  }
  if (label) {
    label.setAttribute('visible', 'false');
  }

  const modal = document.createElement('a-entity');
  const pos = parentWrap.getAttribute('position');
  modal.setAttribute('position', pos);
  modal.setAttribute('look-at', '[camera]');
  modal.setAttribute('scale', '0.01 0.01 0.01');
  modal.setAttribute('animation', 'property: scale; to: 1 1 1; dur: 400; easing: easeOutElastic');

  const planeWidth = 2.6;
  const planeHeight = exhibit.image ? 2.6 : 1.3;

  const modalPlane = document.createElement('a-plane');
  modalPlane.setAttribute('width', planeWidth);
  modalPlane.setAttribute('height', planeHeight);
  // Заглушка пока грузится картинка
  modalPlane.setAttribute('material', 'color: #1a1a24; shader: flat; transparent: true; opacity: 0.95');
  
  // Кнопка закрытия (теперь это прям круг, чтобы лучи raycaster'а в него попадали)
  const closeBtn = document.createElement('a-circle');
  closeBtn.classList.add('clickable');
  closeBtn.setAttribute('radius', '0.12');
  closeBtn.setAttribute('color', '#f44336');
  closeBtn.setAttribute('position', `${planeWidth / 2} ${planeHeight / 2} 0.05`);
  // Взаимодействие для закрытия (3 секунды)
  closeBtn.setAttribute('gaze-interactable', 'duration: 3000; color: #FFF; ringInner: 0.14; ringOuter: 0.18');
  
  const closeText = document.createElement('a-text');
  closeText.setAttribute('value', 'X');
  closeText.setAttribute('align', 'center');
  closeText.setAttribute('position', '0 0 0.01');
  closeText.setAttribute('color', '#FFFFFF');
  closeText.setAttribute('scale', '0.8 0.8 0.8');
  
  closeBtn.appendChild(closeText);
  closeBtn.addEventListener('action-trigger', closeModal3D);

  modal.appendChild(modalPlane);
  modal.appendChild(closeBtn);
  modalContainer.appendChild(modal);

  // Генерируем Canvas для качественного отображения русского текста и картинки
  // Увеличиваем разрешение холста для идеальной резкости (Anti-aliasing)
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = exhibit.image ? 2048 : 1024;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Функция для обновления материала A-Frame
  const updateTexture = () => {
    // Передаем canvas напрямую в material, чтобы избежать ошибок парсинга Base64 в A-Frame
    modalPlane.setAttribute('material', {
      src: canvas,
      shader: 'flat',
      transparent: true
    });
    
    // Принудительно обновляем текстуру, если она уже существует
    const mesh = modalPlane.getObject3D('mesh');
    if (mesh && mesh.material && mesh.material.map) {
      mesh.material.map.needsUpdate = true;
    }
  };

  const drawContent = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Фон
    ctx.fillStyle = '#1e1e24';
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(0, 0, canvas.width, canvas.height, 64);
    } else {
        ctx.rect(0, 0, canvas.width, canvas.height); // fallback
    }
    ctx.fill();

    // Обводка
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 24;
    ctx.stroke();

    let startY = exhibit.image ? 1150 : 200;
    
    // Заголовок
    ctx.font = 'bold 120px sans-serif';
    ctx.fillStyle = '#FF9800';
    ctx.fillText(exhibit.title, 100, startY);
    
    // Текст
    ctx.font = '72px sans-serif';
    ctx.fillStyle = '#DDDDDD';
    const text = exhibit.description.replace(/<[^>]*>?/gm, '');
    let words = text.split(' ');
    let line = '';
    let y = startY + 120;
    for (let i = 0; i < words.length; i++) {
        let testLine = line + words[i] + ' ';
        let metrics = ctx.measureText(testLine);
        // Ограничиваем ширину текста
        if (metrics.width > 1848 && i > 0) {
            ctx.fillText(line, 100, y);
            line = words[i] + ' ';
            y += 90;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, 100, y);

    // Обновляем текстуру
    updateTexture();
  };

  if (exhibit.image) {
      const img = new Image();
      // Обязательно разрешаем CORS, иначе Canvas блокирует toDataURL / использование как текстуру
      img.crossOrigin = 'anonymous'; 
      img.onload = () => {
          drawContent(); // Сначала рисуем фон и текст
          
          // Рисуем картинку сверху с обрезкой (cover)
          const targetW = 2048;
          const targetH = 960;
          const scale = Math.max(targetW / img.width, targetH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = (targetW - drawW) / 2;
          const drawY = (targetH - drawH) / 2;
          
          ctx.save();
          ctx.beginPath();
          if (ctx.roundRect) {
              ctx.roundRect(0, 0, targetW, targetH, [64, 64, 0, 0]);
          } else {
              ctx.rect(0, 0, targetW, targetH);
          }
          ctx.clip();
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
          
          // Перерисовываем обводку поверх картинки
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(0, 0, canvas.width, canvas.height, 64);
          else ctx.rect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#FF9800';
          ctx.lineWidth = 24;
          ctx.stroke();

          updateTexture();
      };
      img.onerror = () => {
          console.warn("Failed to load image via CORS, drawing text only:", exhibit.image);
          drawContent(); // Если картинка заблокирована (CORS), рисуем хотя бы текст
      };
      img.src = exhibit.image;
  } else {
      drawContent();
  }
}

function closeModal3D() {
  modalContainer.innerHTML = ''; // Удаляем плашку
  
  // Возвращаем видимость исходному маркеру
  if (activeModalWrap) {
    const markerMesh = activeModalWrap.querySelector('.marker-mesh');
    if (markerMesh) {
      markerMesh.setAttribute('visible', 'true');
      markerMesh.classList.add('clickable');
    }
    activeModalWrap = null;
  }
}

// Помощник координат
let coordsVisible = false;

function toggleCoords() {
  coordsVisible = !coordsVisible;
  const panel = document.getElementById('coord-panel');
  if (panel) {
      panel.style.display = coordsVisible ? 'block' : 'none';
  }
}

AFRAME.registerComponent('coord-helper', {
  init: function() {
    this.dir = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.coordText = document.getElementById('coord-value');
  },
  tick: function() {
    if (!coordsVisible) return;
    const camera = this.el.sceneEl && this.el.sceneEl.camera;
    if (!camera) return;

    // Куда смотрим
    camera.getWorldDirection(this.dir);
    // Берем точку на расстоянии 3 метров (как в config)
    this.dir.multiplyScalar(-3); 
    
    // Где находимся
    camera.getWorldPosition(this.pos);
    
    // Итоговая координата
    this.pos.add(this.dir);
    
    // Форматируем для конфига
    if (this.coordText) {
      this.coordText.innerText = `${this.pos.x.toFixed(2)} ${this.pos.y.toFixed(2)} ${this.pos.z.toFixed(2)}`;
    }
  }
});

// Обработка входа и выхода из VR режима
document.querySelector('a-scene').addEventListener('enter-vr', function () {
  window.isVRMode = true;
  
  // Отключаем мышиный курсор
  document.getElementById('mouse-cursor').setAttribute('raycaster', 'enabled: false');
  
  // Включаем VR прицел
  const vrCursor = document.getElementById('vr-cursor');
  vrCursor.setAttribute('visible', 'true');
  vrCursor.setAttribute('raycaster', 'enabled: true');
  
  // Полностью отключаем сенсорное управление экраном (свайпы)
  document.getElementById('main-camera').setAttribute('look-controls', 'touchEnabled', 'false');
  
  // Показываем приветственную 3D инструкцию
  const vrInstr = document.getElementById('vr-instructions');
  const vrOkBtn = document.getElementById('vr-ok-btn');
  if (vrInstr && vrOkBtn) {
    vrInstr.setAttribute('visible', 'true');
    vrOkBtn.classList.add('clickable');
  }
});

document.querySelector('a-scene').addEventListener('exit-vr', function () {
  window.isVRMode = false;
  
  // Включаем мышиный курсор обратно
  document.getElementById('mouse-cursor').setAttribute('raycaster', 'enabled: true');
  
  // Отключаем VR прицел
  const vrCursor = document.getElementById('vr-cursor');
  vrCursor.setAttribute('visible', 'false');
  vrCursor.setAttribute('raycaster', 'enabled: false');
  
  // Возвращаем сенсорное управление
  document.getElementById('main-camera').setAttribute('look-controls', 'touchEnabled', 'true');
  
  // Скрываем инструкцию
  const vrInstr = document.getElementById('vr-instructions');
  if (vrInstr) {
    vrInstr.setAttribute('visible', 'false');
    const btn = document.getElementById('vr-ok-btn');
    if (btn) btn.classList.remove('clickable');
  }

  // Сбрасываем все активные анимации загрузки
  document.querySelectorAll('[gaze-interactable]').forEach(el => {
    if (el.components && el.components['gaze-interactable']) {
      el.components['gaze-interactable'].resetState();
    }
  });
});

// Старт при загрузке страницы
window.onload = () => {
  const coordBtn = document.getElementById('coord-toggle-btn');
  if (coordBtn) {
    coordBtn.addEventListener('click', toggleCoords);
  }

  // Добавляем компонент на сцену, чтобы он работал каждый кадр
  document.querySelector('a-scene').setAttribute('coord-helper', '');

  // Обработчик кнопки 'Понятно' в VR инструкции
  const vrOkBtn = document.getElementById('vr-ok-btn');
  if (vrOkBtn) {
    vrOkBtn.setAttribute('gaze-interactable', 'duration: 3000; color: #4CAF50; ringInner: 0.15; ringOuter: 0.2');
    vrOkBtn.addEventListener('action-trigger', () => {
      document.getElementById('vr-instructions').setAttribute('visible', 'false');
      vrOkBtn.classList.remove('clickable'); // Отключаем кликабельность после закрытия
    });
  }
  
  // Запускаем первую сцену
  loadScene(CONFIG.startRoom);
};
