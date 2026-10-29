const MODULE_ID = "mechanisms-and-riddles";

import { PuzzleManager } from "./manager.js";
import { PuzzleStorage } from "./storage.js";
import { PuzzleEngine } from "./puzzles/engine.js";
import { PuzzleActions } from "./actions.js";

module.api = {
  version: "0.4.0",
  ready: true,
  PuzzleManager,
  PuzzleStorage,
  PuzzleEngine,
  PuzzleActions
};	
const MODULE_ID = "mechanisms-and-riddles";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Инициализация`);
game.settings.register("mechanisms-and-riddles", "allowMacroActions", {
  name: "Разрешить вызов макросов из действий загадок",
  hint: "Макросы могут выполнять произвольный код. Включайте эту опцию только если доверяете макросам, настроенным для загадок.",
  scope: "world",
  config: true,
  type: Boolean,
  default: false
});
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;

  module.api = {
    version: "0.2.0",
    ready: true,
    PuzzleManager,
    PuzzleStorage
  };

  if (game.user?.isGM) {
    console.info(`${MODULE_ID} | Хранилище загадок готово.`);
  }
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  const socketlib = game.modules.get("socketlib");

  if (!module) {
    console.error(`${MODULE_ID} | Модуль не найден в реестре Foundry.`);
    return;
  }

  if (!socketlib?.active) {
    console.error(
      `${MODULE_ID} | Требуется установить и включить socketlib.`
    );
    ui.notifications.error(
      "Для модуля «Механизмы и загадки» требуется включённый socketlib."
    );
    return;
  }

  try {
    // Регистрируем пространство имён модуля в socketlib.
    // Обработчики запросов добавим после проверки API отправителя.
    const socket = socketlib.registerModule(MODULE_ID);

    module.api = {
      version: "0.1.0",
      ready: true,
      socket
    };

    console.info(`${MODULE_ID} | Модуль готов.`);
  } catch (error) {
    console.error(`${MODULE_ID} | Не удалось подключить socketlib:`, error);
    ui.notifications.error(
      "Не удалось инициализировать связь модуля с socketlib. Подробности — в консоли."
    );
  }
});
