// main.js — Главный маршрутизатор устройств (ПК / Мобильный)
(function () {
  'use strict';

  // Надежное определение мобильного устройства
  function detectMobile() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTouchScreen = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.innerWidth <= 1024;
    return Boolean(isMobileUA || isTouchScreen);
  }

  const isMobile = detectMobile();
  window.IS_MOBILE = isMobile;

  // Обновляем классы и UI в соответствии с платформой
  document.body.classList.remove('is-mobile', 'is-pc');
  document.body.classList.add(isMobile ? 'is-mobile' : 'is-pc');

  const modeBadge = document.getElementById('device-mode-badge');
  if (modeBadge) {
    modeBadge.textContent = isMobile ? '📱 Мобильный (Сенсорный свайп)' : '💻 ПК (Управление мышью)';
  }

  // Немедленная установка названия комнаты из CONFIG при старте страницы
  const roomTitle = document.getElementById('room-title');
  if (roomTitle && window.CONFIG && window.CONFIG.rooms) {
    const startId = window.location.hash.replace('#', '') || window.CONFIG.startRoom || 'room1';
    if (window.CONFIG.rooms[startId]) {
      roomTitle.textContent = window.CONFIG.rooms[startId].name || 'Главный зал';
    }
  }

  const vrBtn = document.getElementById('custom-vr-btn');
  if (vrBtn) {
    // Кнопка VR нужна исключительно на мобильных устройствах под очки Cardboard
    vrBtn.style.display = isMobile ? 'inline-flex' : 'none';
  }

  const scriptToLoad = isMobile ? 'app-mobile.js' : 'app-pc.js';
  console.log(`[Музей] Определено устройство: ${isMobile ? 'Мобильный' : 'ПК'}. Загрузка ${scriptToLoad}...`);

  // Загружаем нужный модуль скрипта
  // Примечание: динамически вставленные теги <script> всегда загружаются
  // асинхронно — отслеживаем завершение через onload/onerror.
  const script = document.createElement('script');
  script.src = scriptToLoad;

  script.onload = function () {
    console.log(`[Музей] Модуль ${scriptToLoad} успешно загружен.`);
    if (typeof window.initMuseumTour === 'function') {
      window.initMuseumTour();
    }
  };

  script.onerror = function () {
    console.error(`[Музей] Ошибка при загрузке ${scriptToLoad}.`);
    const roomTitle = document.getElementById('room-title');
    if (roomTitle) roomTitle.textContent = 'Ошибка загрузки модуля музея';
  };

  document.head.appendChild(script);
})();
