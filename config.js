const CONFIG = {
  // С какой комнаты начинать при запуске
  startRoom: "room1",
  
  // Настройки всех комнат
  rooms: {
    "room1": {
      name: "Главный зал",
      // Панорамы кладите в папку assets/ и указывайте путь к ним
      panorama: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Equirectangular_projection_SW.jpg/1280px-Equirectangular_projection_SW.jpg",
      
      // Маленькие белые точки (экспонаты)
      exhibits: [
        {
          id: "ex1",
          title: "Первый экспонат",
          description: "Описание вашего экспоната. Можно использовать HTML-теги, например <b>жирный текст</b>.",
          position: "2 0 -3", // Координаты X, Y, Z
          image: "https://images.unsplash.com/photo-1544928147-79a2dbc1f389?q=80&w=600&auto=format&fit=crop" // Можно указать картинку из папки assets/exhibit1.jpg
        }
      ],
      
      // Полупрозрачные стрелки (переходы)
      links: [
        {
          id: "lk1",
          target: "room2", // Куда ведет переход
          label: "Перейти в коридор",
          position: "-3 0 -2"
        }
      ]
    },
    
    "room2": {
      name: "Коридор",
      panorama: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/European_Southern_Observatory_Logo.svg/1024px-European_Southern_Observatory_Logo.svg.png",
      exhibits: [],
      links: [
        {
          id: "lk2",
          target: "room1",
          label: "Вернуться в главный зал",
          position: "0 0 -4"
        }
      ]
    }
  }
};
