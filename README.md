# Music Presence

Показывает в Discord, что ты слушаешь в браузере: трек, исполнителя, обложку и сколько осталось.
Закрыл вкладку или поставил на паузу — статус пропадает.

Работает в Chrome, Edge, Brave и Яндекс Браузере на Windows 10/11. Сайты: SoundCloud, YouTube,
YouTube Music, Яндекс Музыка, Spotify, VK Музыка, Звук, Bandcamp, Deezer, Apple Music, TIDAL.

Основано на [soundcloud-presence](https://github.com/zitraksmodezxc/soundcloud-presence).
Программа не связана с Discord и музыкальными сервисами.

## Как это устроено

- **Расширение** (`extension/`) смотрит на вкладки с музыкой: что играет, кто исполняет, на какой секунде.
  Если музыка играет в нескольких вкладках, показывается та, что включена последней.
- **Помощник** (`src/host.py`) передаёт это приложению Discord на компьютере. Сам он не запускается и в
  фоне не висит: браузер включает его, когда заиграла музыка, и выключает через минуту тишины.

Браузер не может сам говорить с Discord, поэтому без помощника не обойтись.

## Установка

1. Скачай `MusicPresence-Setup.exe` со страницы [Releases](https://github.com/stylist111/music-presence/releases/latest)
   и запусти. Путь к папке расширения сам скопируется в буфер обмена.
2. В браузере: меню ⋮ → Расширения → Управление расширениями → включи **Режим разработчика** →
   **Загрузить распакованное расширение** → вставь путь (Ctrl+V) → **Выбор папки**.
3. В Discord: Настройки → Конфиденциальность активности → включи «Показывать текущую активность».
4. Включи музыку в браузере.

Своё приложение в Discord создавать не нужно: оно уже есть, его номер записан в `CLIENT_ID`
в `extension/background.js`. Хочешь другую подпись вместо «Слушает музыку» — создай своё на
https://discord.com/developers/applications и поставь его Application ID туда же.

Удалить: Параметры Windows → Приложения → Music Presence, и убрать расширение из браузера.

## Если не работает

- Нажми на значок расширения: там видно, что сейчас играет и подключён ли Discord.
- Журнал помощника — `host.log` в папке программы (`%USERPROFILE%\Music Presence`).

## Разработка

- Запуск из исходников (нужен Python 3.11+): `python src\host.py --install`, затем загрузить папку `extension`.
- Тесты: `python -m unittest discover -s tests`.
- Сборка установщика (PyInstaller + Inno Setup 6): `powershell -ExecutionPolicy Bypass -File src\build.ps1`.
- Выпуск: поднять `version` в `extension/manifest.json`, затем `git tag vX.Y.Z` и `git push origin main vX.Y.Z` —
  GitHub сам соберёт установщик и выложит его в Releases.