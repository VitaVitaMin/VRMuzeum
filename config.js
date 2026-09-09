const CONFIG = {
  // С какой комнаты начинать при запуске
  startRoom: "room1",
  
  // Настройки всех комнат
  rooms: {
    "room1": {
      name: "Главный зал",
      // Панорамы кладите в папку assets/ и указывайте путь к ним
      panorama: "assets/123.jpg",
      
      // Маленькие белые точки (экспонаты)
      exhibits: [
        {
          id: "ex1",
          title: "Первый экспонат",
          description: "Описание вашего экспоната. Можно использовать HTML-теги, например <b>жирный текст</b>.",
          position: "2 0 -3", // Координаты X, Y, Z
          image: "assets/images.jpg" // Можно указать картинку из папки assets/exhibit1.jpg
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
      panorama: "assets/1234.jpg",
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
