// main.js - Определяет устройство и загружает нужный скрипт
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

console.log(isMobile ? "Мобильное устройство определено. Загрузка мобильной версии..." : "ПК определен. Загрузка версии для ПК...");

const script = document.createElement('script');
script.src = isMobile ? 'app-mobile.js' : 'app-pc.js';
document.body.appendChild(script);
