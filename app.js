// Логика поведения "умных маркеров" (показывают текст только когда смотрим на них)
AFRAME.registerComponent('smart-marker', {
  init: function () {
    this.vec3 = new THREE.Vector3();
    this.camDir = new THREE.Vector3();
    this.markerDir = new THREE.Vector3();
  },
  tick: function () {
    if (!this.mesh) this.mesh = this.el.querySelector('.marker-mesh');
    if (!this.label) this.label = this.el.querySelector('.marker-label');
    const camera = this.el.sceneEl && this.el.sceneEl.camera;
    if (!camera || !this.mesh) return;

    // Вектор взгляда камеры
    camera.getWorldDirection(this.camDir);
    this.camDir.multiplyScalar(-1);

    // Вектор направления к маркеру
    this.el.object3D.getWorldPosition(this.markerDir);
    camera.getWorldPosition(this.vec3);
    this.markerDir.sub(this.vec3).normalize();

    // Скалярное произведение (насколько прямо смотрим)
    const dot = this.camDir.dot(this.markerDir);

    // Плавное изменение прозрачности
    let opacity = 0.4;
    if (dot > 0.85) {
      opacity = 0.4 + ((dot - 0.85) / 0.15) * 0.6;
      opacity = Math.min(1.0, Math.max(0.4, opacity));
    }
    this.mesh.setAttribute('material', 'opacity', opacity);

    // Показываем текстовую подсказку только если смотрим прямо
    if (this.label) {
      this.label.setAttribute('visible', dot > 0.98);
    }
  }
});

// Глобальные переменные UI
const sky = document.getElementById('sky-pano');
const linksContainer = document.getElementById('links-container');
const exhibitsContainer = document.getElementById('exhibits-container');
const fadeOverlay = document.getElementById('fade-overlay');
const roomTitle = document.getElementById('room-title');

// Глобальные переменные Модального окна
const modal = document.getElementById('exhibit-modal');
const modalTitle = document.getElementById('modal-title');
const modalImage = document.getElementById('modal-image');
const modalDesc = document.getElementById('modal-desc');

// SVG код для стрелочки (закодирован для использования в A-Frame)
const ARROW_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22 fill=%22none%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath d=%22M20 70 L 50 30 L 80 70%22 stroke=%22white%22 stroke-width=%2212%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E";

// Функция загрузки комнаты
function loadScene(roomId) {
  const room = CONFIG.rooms[roomId];
  if (!room) {
    console.error("Комната не найдена в config.js:", roomId);
    return;
  }

  // 1. Включаем затемнение (Fade-out)
  fadeOverlay.style.opacity = '1';

  // 2. Ждем 500мс пока экран станет черным, затем меняем содержимое
  setTimeout(() => {
    
    // Меняем текстуру неба
    sky.setAttribute('src', room.panorama);
    
    // Обновляем текст в UI
    roomTitle.innerText = room.name;

    // Очищаем старые маркеры
    linksContainer.innerHTML = '';
    exhibitsContainer.innerHTML = '';

    // Генерируем переходы (Ссылки)
    if (room.links) {
      room.links.forEach(lk => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', lk.position);
        wrap.setAttribute('look-at', '[camera]'); // Всегда смотрит в камеру
        wrap.setAttribute('smart-marker', '');

        // Сама картинка стрелочки
        const marker = document.createElement('a-image');
        marker.classList.add('clickable', 'marker-mesh');
        marker.setAttribute('src', ARROW_SVG);
        marker.setAttribute('width', '0.4');
        marker.setAttribute('height', '0.4');
        marker.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 0.7');
        // Плавная анимация прыжка вверх-вниз
        marker.setAttribute('animation', 'property: position; dir: alternate; dur: 800; loop: true; to: 0 0.1 0');

        // Текстовая подпись
        const label = document.createElement('a-text');
        label.classList.add('marker-label');
        label.setAttribute('value', lk.label + ' (Переход)');
        label.setAttribute('align', 'center');
        label.setAttribute('position', '0 0.3 0');
        label.setAttribute('color', '#4CAF50'); // Зеленый цвет для переходов
        label.setAttribute('scale', '0.8 0.8 0.8');
        label.setAttribute('visible', 'false');

        // Обработка клика
        marker.addEventListener('click', () => loadScene(lk.target));

        wrap.appendChild(marker);
        wrap.appendChild(label);
        linksContainer.appendChild(wrap);
      });
    }

    // Генерируем Экспонаты
    if (room.exhibits) {
      room.exhibits.forEach(ex => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', ex.position);
        wrap.setAttribute('look-at', '[camera]');
        wrap.setAttribute('smart-marker', '');

        // Маленькая белая точка
        const marker = document.createElement('a-sphere');
        marker.classList.add('clickable', 'marker-mesh');
        marker.setAttribute('radius', '0.08');
        marker.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 0.8');

        // Текстовая подпись
        const label = document.createElement('a-text');
        label.classList.add('marker-label');
        label.setAttribute('value', ex.title);
        label.setAttribute('align', 'center');
        label.setAttribute('position', '0 0.2 0');
        label.setAttribute('color', '#FFF');
        label.setAttribute('scale', '0.8 0.8 0.8');
        label.setAttribute('visible', 'false');

        // Обработка клика - открытие модального HTML окна
        marker.addEventListener('click', () => {
          modalTitle.innerText = ex.title;
          modalDesc.innerHTML = ex.description;
          
          if (ex.image) {
            modalImage.src = ex.image;
            modalImage.style.display = 'block';
          } else {
            modalImage.style.display = 'none';
          }
          
          modal.style.display = 'flex';
        });

        wrap.appendChild(marker);
        wrap.appendChild(label);
        exhibitsContainer.appendChild(wrap);
      });
    }

    // 3. Немного ждем, чтобы текстура панорамы загрузилась, и снимаем затемнение (Fade-in)
    setTimeout(() => {
      fadeOverlay.style.opacity = '0';
    }, 200);

  }, 500); // 500мс = время CSS transition
}

// Функция закрытия модального окна экспоната
function closeModal() {
  modal.style.display = 'none';
}

// Помощник координат
let coordsVisible = false;
function toggleCoords() {
  coordsVisible = !coordsVisible;
  const panel = document.getElementById('coord-panel');
  panel.style.display = coordsVisible ? 'block' : 'none';
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

// Старт при загрузке страницы
window.onload = () => {
  // Привязываем кнопки через JavaScript, чтобы избежать проблем при скачивании
  const coordBtn = document.getElementById('coord-toggle-btn');
  if (coordBtn) {
    coordBtn.addEventListener('click', toggleCoords);
  }

  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  // Добавляем компонент на сцену, чтобы он работал каждый кадр
  document.querySelector('a-scene').setAttribute('coord-helper', '');
  loadScene(CONFIG.startRoom);
};
