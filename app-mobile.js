

const sky = document.getElementById('sky-pano');
const linksContainer = document.getElementById('links-container');
const exhibitsContainer = document.getElementById('exhibits-container');
const modalContainer = document.getElementById('modal-container');
const roomTitle = document.getElementById('room-title');
const ARROW_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22 fill=%22none%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath d=%22M20 70 L 50 30 L 80 70%22 stroke=%22white%22 stroke-width=%2212%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E";

window.isVRMode = false;

AFRAME.registerComponent('gaze-interactable', {
  schema: {
    duration: {type: 'number', default: 3000},
    color: {type: 'color', default: '#4CAF50'},
    ringInner: {type: 'number', default: 0.2},
    ringOuter: {type: 'number', default: 0.3}
  },
  init: function () {
    this.timer = null;
    this.fusing = false;
    this.ring = document.createElement('a-ring');
    this.ring.setAttribute('radius-inner', this.data.ringInner);
    this.ring.setAttribute('radius-outer', this.data.ringOuter);
    this.ring.setAttribute('material', `color: ${this.data.color}; shader: flat; transparent: true; opacity: 0`);
    this.ring.setAttribute('position', '0 0 0.01');
    this.el.appendChild(this.ring);

    this.onMouseEnter = () => {
      if (!window.isVRMode) return;
      this.fusing = true;
      this.ring.setAttribute('animation', `property: components.material.material.opacity; from: 0; to: 1; dur: 200; easing: linear`);
      this.ring.setAttribute('animation__scale', `property: scale; from: 1 1 1; to: 0 0 0; dur: ${this.data.duration}; easing: linear`);
      
      this.timer = setTimeout(() => {
        this.fusing = false;
        this.ring.removeAttribute('animation__scale');
        this.ring.setAttribute('scale', '0 0 0');
        this.el.emit('action-trigger');
      }, this.data.duration);
    };

    this.onMouseLeave = () => {
      if (this.timer) clearTimeout(this.timer);
      this.fusing = false;
      this.ring.removeAttribute('animation__scale');
      this.ring.setAttribute('scale', '1 1 1');
      this.ring.setAttribute('animation', `property: components.material.material.opacity; from: 1; to: 0; dur: 200; easing: linear`);
    };

    this.el.addEventListener('mouseenter', this.onMouseEnter);
    this.el.addEventListener('mouseleave', this.onMouseLeave);
  }
});

function createTextTexture(text, color = '#FFFFFF', bg = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) {
        ctx.fillStyle = 'rgba(20, 20, 24, 0.7)';
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(0, 0, 1024, 256, 32);
        else ctx.rect(0, 0, 1024, 256);
        ctx.fill();
    }
    ctx.font = 'bold 80px sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,1)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, 512, 128);
    ctx.fillText(text, 512, 128);
    return canvas.toDataURL();
}

function setupVRInstructions() {
    const instr = document.getElementById('vr-instructions');
    if (!instr) return;
    instr.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.fillStyle = '#3b3b4a';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(0, 0, 1024, 1024, 64);
    else ctx.rect(0,0,1024,1024);
    ctx.fill();
    
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 16;
    ctx.stroke();
    
    ctx.fillStyle = '#FF9800';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('РЕЖИМ VR', 512, 200);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText('Сенсорное управление отключено.', 512, 400);
    ctx.fillText('Для взаимодействия наведите', 512, 500);
    ctx.fillText('прицел на кнопку (или объект)', 512, 580);
    ctx.fillText('и удерживайте его 3 секунды.', 512, 660);
    
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(256, 760, 512, 140, 40);
    else ctx.rect(256, 760, 512, 140);
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText('ПОНЯТНО (3 сек)', 512, 850);
    
    const plane = document.createElement('a-plane');
    plane.setAttribute('width', '2.5');
    plane.setAttribute('height', '2.5');
    plane.setAttribute('material', 'shader: flat; transparent: true');
    plane.setAttribute('src', canvas.toDataURL());
    
    const btn = document.createElement('a-plane');
    btn.setAttribute('id', 'vr-ok-btn');
    btn.setAttribute('width', '1.25');
    btn.setAttribute('height', '0.35');
    btn.setAttribute('position', '0 -0.85 0.05');
    btn.setAttribute('material', 'opacity: 0; transparent: true');
    btn.setAttribute('gaze-interactable', 'duration: 3000; color: #FFF; ringInner: 0.15; ringOuter: 0.2');
    btn.classList.add('clickable');
    
    const hideInstructions = () => {
        instr.setAttribute('visible', 'false');
        btn.classList.remove('clickable');
    };
    
    btn.addEventListener('action-trigger', hideInstructions);
    btn.addEventListener('click', hideInstructions);
    
    instr.appendChild(plane);
    instr.appendChild(btn);
}

function triggerTransition(callback) {
  const vrFade = document.getElementById('vr-fade');
  if (!vrFade) { callback(); return; }
  vrFade.setAttribute('animation__fadein', 'property: opacity; from: 0; to: 1; dur: 400; easing: easeInOutQuad');
  setTimeout(() => {
    callback();
    setTimeout(() => {
        vrFade.setAttribute('animation__fadeout', 'property: opacity; from: 1; to: 0; dur: 800; easing: easeInOutQuad');
        vrFade.removeAttribute('animation__fadein');
    }, 100);
  }, 450);
}

let isFirstLoad = true;

function loadScene(roomId) {
  const room = CONFIG.rooms[roomId];
  if (!room) return;
  window.history.replaceState(null, null, '#' + roomId);

  const loadAction = () => {
    sky.setAttribute('src', room.panorama);
    roomTitle.innerText = room.name;
    linksContainer.innerHTML = '';
    exhibitsContainer.innerHTML = '';
    closeModal3D();

    if (room.links) {
      room.links.forEach(lk => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', lk.position);
        wrap.setAttribute('look-at', '[camera]');

        const marker = document.createElement('a-image');
        marker.classList.add('clickable');
        marker.setAttribute('src', ARROW_SVG);
        marker.setAttribute('scale', '0.5 0.5 0.5');
        marker.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 0.8');
        marker.setAttribute('animation', 'property: position; dir: alternate; dur: 800; loop: true; to: 0 0.1 0');
        marker.setAttribute('gaze-interactable', 'duration: 3000; color: #4CAF50; ringInner: 0.25; ringOuter: 0.3');

        const label = document.createElement('a-image');
        label.classList.add('marker-label');
        label.setAttribute('src', createTextTexture(lk.label, '#4CAF50'));
        label.setAttribute('position', '0 0.45 0');
        label.setAttribute('scale', '1.5 0.375 1');
        label.setAttribute('visible', 'false');

        const jump = () => loadScene(lk.target);
        marker.addEventListener('action-trigger', jump);
        marker.addEventListener('click', jump);

        wrap.appendChild(marker);
        wrap.appendChild(label);
        linksContainer.appendChild(wrap);
      });
    }

    if (room.exhibits) {
      room.exhibits.forEach(ex => {
        const wrap = document.createElement('a-entity');
        wrap.setAttribute('position', ex.position);
        wrap.setAttribute('look-at', '[camera]');
        wrap.setAttribute('smart-marker', '');

        const marker = document.createElement('a-circle');
        marker.classList.add('clickable', 'marker-mesh');
        marker.setAttribute('radius', '0.08');
        marker.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 0.8');
        marker.setAttribute('gaze-interactable', 'duration: 3000; color: #FF9800; ringInner: 0.12; ringOuter: 0.15');

        const label = document.createElement('a-image');
        label.classList.add('marker-label');
        label.setAttribute('src', createTextTexture(ex.title, '#FFFFFF', true));
        label.setAttribute('position', '0 0.3 0');
        label.setAttribute('scale', '1.5 0.375 1');
        label.setAttribute('visible', 'false');

        const open = () => showModal3D(ex, wrap);
        marker.addEventListener('action-trigger', open);
        marker.addEventListener('click', open);

        wrap.appendChild(marker);
        wrap.appendChild(label);
        exhibitsContainer.appendChild(wrap);
      });
    }
  };

  if (isFirstLoad) {
    loadAction();
    setTimeout(() => {
        const vrFade = document.getElementById('vr-fade');
        if (vrFade) vrFade.setAttribute('animation__fadeout', 'property: opacity; from: 1; to: 0; dur: 800; easing: easeInOutQuad');
    }, 1000);
    isFirstLoad = false;
  } else {
    triggerTransition(loadAction);
  }
}

let activeModalWrap = null;
function showModal3D(exhibit, parentWrap) {
  closeModal3D();
  activeModalWrap = parentWrap;
  
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
  modal.setAttribute('animation', 'property: scale; to: 1 1 1; dur: 400; easing: easeOutElastic');

  const planeWidth = 2.6;
  const planeHeight = exhibit.image ? 2.6 : 1.3;

  const modalPlane = document.createElement('a-plane');
  modalPlane.setAttribute('width', planeWidth);
  modalPlane.setAttribute('height', planeHeight);
  modalPlane.setAttribute('material', 'color: #3b3b4a; shader: flat; transparent: true; opacity: 0.95');
  
  const closeBtn = document.createElement('a-circle');
  closeBtn.classList.add('clickable');
  closeBtn.setAttribute('radius', '0.15');
  closeBtn.setAttribute('color', '#f44336');
  closeBtn.setAttribute('position', `${planeWidth / 2} ${planeHeight / 2} 0.05`);
  closeBtn.setAttribute('gaze-interactable', 'duration: 3000; color: #FFF; ringInner: 0.15; ringOuter: 0.2');
  
  const closeText = document.createElement('a-text');
  closeText.setAttribute('value', 'X');
  closeText.setAttribute('align', 'center');
  closeText.setAttribute('position', '0 0 0.01');
  closeText.setAttribute('color', '#FFFFFF');
  closeText.setAttribute('scale', '0.8 0.8 0.8');
  
  closeBtn.appendChild(closeText);
  closeBtn.addEventListener('action-trigger', closeModal3D);
  closeBtn.addEventListener('click', closeModal3D);

  modal.appendChild(modalPlane);
  modal.appendChild(closeBtn);
  modalContainer.appendChild(modal);

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = exhibit.image ? 2048 : 1024;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const updateTexture = () => {
    modalPlane.setAttribute('material', 'shader: flat; transparent: true');
    modalPlane.setAttribute('src', canvas.toDataURL());
  };

  const drawContent = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3b3b4a';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, canvas.width, canvas.height, 64);
    else ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.fill();

    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 24;
    ctx.stroke();

    let startY = exhibit.image ? 1150 : 200;
    
    ctx.font = 'bold 120px sans-serif';
    ctx.fillStyle = '#FF9800';
    ctx.fillText(exhibit.title, 100, startY);
    
    ctx.font = 'bold 72px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    const text = exhibit.description.replace(/<[^>]*>?/gm, '');
    let words = text.split(' ');
    let line = '';
    let y = startY + 120;
    for (let i = 0; i < words.length; i++) {
        let testLine = line + words[i] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > 1848 && i > 0) {
            ctx.fillText(line, 100, y);
            line = words[i] + ' ';
            y += 90;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, 100, y);
    updateTexture();
  };

  if (exhibit.image) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
          drawContent();
          const targetW = 2048;
          const targetH = 960;
          const scale = Math.max(targetW / img.width, targetH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = (targetW - drawW) / 2;
          const drawY = (targetH - drawH) / 2;
          
          ctx.save();
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(0, 0, targetW, targetH, [64, 64, 0, 0]);
          else ctx.rect(0, 0, targetW, targetH);
          ctx.clip();
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
          
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(0, 0, canvas.width, canvas.height, 64);
          else ctx.rect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#FF9800';
          ctx.lineWidth = 24;
          ctx.stroke();

          updateTexture();
      };
      img.onerror = () => drawContent();
      img.src = exhibit.image;
  } else {
      drawContent();
  }
}

function closeModal3D() {
  modalContainer.innerHTML = '';
  if (activeModalWrap) {
    const markerMesh = activeModalWrap.querySelector('.marker-mesh');
    if (markerMesh) {
      markerMesh.setAttribute('visible', 'true');
      markerMesh.classList.add('clickable');
    }
    activeModalWrap = null;
  }
}

AFRAME.registerComponent('smart-marker', {
  init: function () {
    this.label = this.el.querySelector('.marker-label');
    if (!this.label) return;
    
    this.el.addEventListener('mouseenter', () => {
      this.label.setAttribute('visible', 'true');
    });
    
    this.el.addEventListener('mouseleave', () => {
      this.label.setAttribute('visible', 'false');
    });
  }
});

let coordsVisible = false;
function toggleCoords() {
  coordsVisible = !coordsVisible;
  const panel = document.getElementById('coord-panel');
  if (panel) panel.style.display = coordsVisible ? 'block' : 'none';
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
    camera.getWorldDirection(this.dir);
    this.dir.multiplyScalar(-3); 
    camera.getWorldPosition(this.pos);
    this.pos.add(this.dir);
    if (this.coordText) this.coordText.innerText = `${this.pos.x.toFixed(2)} ${this.pos.y.toFixed(2)} ${this.pos.z.toFixed(2)}`;
  }
});

window.onload = () => {
  setupVRInstructions();

  const coordBtn = document.getElementById('coord-toggle-btn');
  if (coordBtn) coordBtn.addEventListener('click', toggleCoords);
  document.querySelector('a-scene').setAttribute('coord-helper', '');
  
  const sceneEl = document.querySelector('a-scene');
  
  sceneEl.addEventListener('enter-vr', function () {
    window.isVRMode = true;
    document.getElementById('mouse-cursor').setAttribute('raycaster', 'enabled: false');
    
    const vrCursor = document.getElementById('vr-cursor');
    vrCursor.setAttribute('visible', 'true');
    vrCursor.setAttribute('raycaster', 'enabled: true');
    
    document.getElementById('vr-instructions').setAttribute('visible', 'true');
  });

  sceneEl.addEventListener('exit-vr', function () {
    window.isVRMode = false;
    document.getElementById('mouse-cursor').setAttribute('raycaster', 'enabled: true');
    
    const vrCursor = document.getElementById('vr-cursor');
    vrCursor.setAttribute('visible', 'false');
    vrCursor.setAttribute('raycaster', 'enabled: false');
    
    document.getElementById('vr-instructions').setAttribute('visible', 'false');
  });
  
  let startRoom = window.location.hash.replace('#', '');
  if (!startRoom || !CONFIG.rooms[startRoom]) startRoom = CONFIG.startRoom;
  loadScene(startRoom);
};
