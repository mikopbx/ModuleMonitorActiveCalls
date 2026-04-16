# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## КРИТИЧЕСКИ ВАЖНО: Запреты при разработке

**КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:**
1. **Изменять файлы вне директории модуля** - никогда не модифицировать файлы в `/offload/`, `/usr/www/src/`, или других системных директориях MikoPBX
2. **Использовать rsync, cp -r или tar для установки модуля** - это может перезаписать системные файлы MikoPBX
3. **Удалять директорию модуля целиком** (`rm -rf /storage/.../ModuleMonitorActiveCalls`) - это удалит базу данных модуля

## Требования к коду

**Совместимость:**
- Код должен быть совместим с **PHP 7.4** и **PHP 8.x**
- Код должен работать с **Phalcon 4.x** и **Phalcon 5.x** (используйте `MikoPBXVersion`)

**Избегайте (только PHP 8+):**
- `match` выражения → используйте `switch`
- Union types `function foo(): int|string` → используйте PHPDoc
- Named arguments `foo(name: $value)`
- Constructor property promotion
- Nullsafe operator `?->`
- `str_contains()`, `str_starts_with()`, `str_ends_with()` → используйте `strpos() !== false`

## Project Overview

ModuleMonitorActiveCalls is a PHP module for MikoPBX (Asterisk-based VoIP PBX) that monitors active calls and enables supervisors to perform real-time call actions (listen, whisper, barge-in, hangup).

**Stack:** PHP 7.4.6+, Phalcon MVC framework, Redis cache, Asterisk AMI, Vue.js frontend

## Сборка и установка модуля

### Сборка архива (локально)

```bash
cd /Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls
zip -r ../ModuleMonitorActiveCalls.zip . -x "*.git*" -x "*tasks.md*" -x "*.DS_Store*" -x "*CLAUDE.md*"
```

### Загрузка на сервер

```bash
scp ../ModuleMonitorActiveCalls.zip user@server:/home/user/
```

### Установка через WorkerModuleInstaller (ЕДИНСТВЕННЫЙ РАЗРЕШЁННЫЙ СПОСОБ)

```bash
# На сервере: создать settings.json
cat > /tmp/settings.json << 'EOF'
{
    "currentModuleDir": "/storage/usbdisk1/mikopbx/custom_modules/ModuleMonitorActiveCalls",
    "filePath": "/home/user/ModuleMonitorActiveCalls.zip",
    "uniqid": "ModuleMonitorActiveCalls"
}
EOF

# Установить модуль (сохраняет БД!)
php -f /usr/www/src/PBXCoreREST/Workers/WorkerModuleInstaller.php start /tmp/settings.json
```

### Быстрая команда (всё в одном)

```bash
cd /Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls && \
zip -r ../ModuleMonitorActiveCalls.zip . -x "*.git*" -x "*tasks.md*" -x "*.DS_Store*" -x "*CLAUDE.md*" && \
scp ../ModuleMonitorActiveCalls.zip user@server:/home/user/ && \
ssh user@server 'php -f /usr/www/src/PBXCoreREST/Workers/WorkerModuleInstaller.php start /tmp/settings.json'
```

## Инициализация в скриптах

Все PHP скрипты (bin/, tests/) должны начинаться с:

```php
#!/usr/bin/php
<?php
require_once('Globals.php');

use Modules\ModuleMonitorActiveCalls\Models\ModuleMonitorActiveCalls;
// ...
```

**Важно:** `Globals.php` должен быть симлинком на `/usr/www/src/Core/Config/Globals.php`

```bash
ln -sf /usr/www/src/Core/Config/Globals.php /storage/.../ModuleMonitorActiveCalls/bin/Globals.php
```

## Architecture

### Dual-Worker Pattern

1. **WorkerActiveCalls** (`bin/WorkerActiveCalls.php`) - Main AMI event listener
   - Connects to Asterisk Manager Interface
   - Listens for call/queue events (Newchannel, Hangup, BridgeEnter, QueueCallerJoin, etc.)
   - Maintains state for channels, bridges, queue entries
   - Writes active call data to Redis cache

2. **WorkerAmiActions** (`bin/WorkerAmiActions.php`) - Call action executor
   - Consumes Beanstalk queue messages
   - Executes call actions (Hangup, Listen, Whisper, Join)
   - Rate-limited AMI operations

3. **safe.php** (`bin/safe.php`) - Process keeper (runs via cron every minute)

### Worker Health Check (State-file подход)

WorkerActiveCalls использует **собственный механизм контроля здоровья** вместо стандартного `CHECK_BY_AMI` из MikoPBX core.

**Проблема CHECK_BY_AMI:** WorkerSafeScriptsCore пингует воркер через AMI UserEvent и ожидает pong. Во время тяжёлой инициализации (`collectActiveChannels` делает 7-8 AMI GetVar на каждый активный канал) воркер не находится в event loop и не может ответить на ping. Safe scripts считают воркер зависшим и отправляют SIGUSR1 (restart). Новый воркер тоже не успевает ответить на ping во время init — бесконечный цикл рестартов каждые ~3 минуты.

**Решение — state-file + idle callback:**

1. **Тип проверки:** `CHECK_BY_PID_NOT_ALERT` — MikoPBX core только проверяет PID, не пингует через AMI
2. **State-файл** (`/tmp/MonitorActiveCalls_worker.state`):
   ```json
   {"pid": 12345, "ts": 1738610800, "status": "running"}
   ```
3. **Жизненный цикл обновлений:**
   - `start()` → `status=starting` (перед инициализацией)
   - После init → `status=running`
   - В event loop → idle callback обновляет `ts` каждые 30 сек
4. **Idle callback в AsteriskManager:**
   - `waitUserEvent()` имеет внутренний do-while цикл с socket timeout 5 сек
   - При timeout + успешный AMI ping (соединение живо) + прошло ≥30 сек → вызов callback
   - Callback обновляет state-файл — доказывает что процесс жив И AMI-соединение работает
5. **safe.php** (cron каждую минуту) проверяет state-файл:
   - Нет PID → запустить
   - State-файл отсутствует/повреждён → kill + restart
   - PID в файле ≠ реальному PID → kill + restart
   - `status=starting`, age > 120 сек → зависла инициализация, kill + restart
   - `status=running`, age > 90 сек → воркер завис, kill + restart
   - Иначе → всё ок

### Data Flow

```
Asterisk AMI Events → WorkerActiveCalls → Redis Cache → Web UI (reads cache)
User Action → Controller → Beanstalk Queue → WorkerAmiActions → Asterisk AMI
```

### Key Files

| File | Purpose |
|------|---------|
| `Lib/MonitorActiveCallsConf.php` | Module configuration, worker definitions, AMI config |
| `Lib/MonitorActiveCallsMain.php` | Module lifecycle (start/stop workers) |
| `Lib/AsteriskManager.php` | Custom AMI socket client |
| `Lib/CacheManager.php` | Redis adapter (DB index 3, prefix `ModuleMonitorActiveCalls_`) |
| `App/Controllers/ModuleMonitorActiveCallsController.php` | Web API endpoints |
| `public/assets/js/module-monitor-active-calls-index.js` | Vue.js frontend |

### Database Models

- **ModuleMonitorActiveCalls** - Module settings (admin user ID)
- **UsersSettings** - Per-user preferences (queue filters, min wait visible)

Tables are created via Phalcon model annotations in `Setup/PbxExtensionSetup.php`.

### API Endpoints

- `getActiveChannelsAction()` - Fetch active calls (v1)
- `getActiveChannelsV2Action()` - Fetch active calls with queues (v2)
- `executeCallAction()` - Execute call action (hangup/listen/whisper/join)
- `saveUserAction()` - Save user settings

### Access Control

Integrates with optional `ModuleUsersUI` module for role-based filtering. Supervisors see all calls; agents see only their extensions.

## Channel States

Constants in `WorkerActiveCalls`:
- `STATE_IDLE`, `STATE_RINGING`, `STATE_ONHOLD`, `STATE_UP`, `STATE_BUSY`, `STATE_UNAVAILABLE`

## Configuration

AMI user `monitor-active-calls` is auto-generated with limited permissions (read: system,agent,call,cdr,user; write: system,agent,call,originate).

## File Paths (на сервере)

| Path | Description |
|------|-------------|
| `/storage/usbdisk1/mikopbx/custom_modules/ModuleMonitorActiveCalls/` | Module directory |
| `/storage/usbdisk1/mikopbx/custom_modules/ModuleMonitorActiveCalls/db/module.db` | SQLite database |
| `/storage/usbdisk1/mikopbx/logs/ModuleMonitorActiveCalls/` | Log files |
| `/usr/www/src/Core/Config/Globals.php` | MikoPBX bootstrap |

## Совместимость с Phalcon

Используйте `MikoPBXVersion` для кросс-версионной совместимости:

| Метод | Phalcon 4 | Phalcon 5 |
|-------|-----------|-----------|
| `isPhalcon5Version()` | `false` | `true` |
| `getDefaultDi()` | `\Phalcon\Di::getDefault()` | `\Phalcon\Di\Di::getDefault()` |
| `getLoggerClass()` | `\Phalcon\Logger` | `\Phalcon\Logger\Logger` |

## Translations

28 languages supported in `/Messages/` directory (PHP arrays).

## Dependencies

- **Required:** MikoPBX >= 2024.1.114
- **Optional:** ModuleUsersUI (access control), ModuleSoftphoneBackend (contact names)
- **PHP:** cesargb/php-log-rotation 2.6.0

## JavaScript Build

Source files are in `public/assets/js/src/`. After modifying them, compiled files must be generated in `public/assets/js/`.

**IMPORTANT:** Only edit files in `src/` directory. Files in `public/assets/js/*.js` are auto-generated.

Build process uses Babel via PHPStorm File Watcher:
- See setup: https://docs.mikopbx.com/mikopbx-development/prepare-ide-tools/mac#phpstorm-setup-babel
- Babel path: `/Users/apor/Developement/MikoPBX/MikoPBXUtils/node_modules/.bin/babel`
- Presets: `airbnb`
- Source maps: enabled

To rebuild manually:
```bash
cd /Users/apor/Developement/MikoPBX/MikoPBXUtils && \
cp babel.config.json babel.config.json.bak && \
echo '{"presets":[["@babel/preset-env",{"targets":{"chrome":50,"ie":11,"firefox":45}}]]}' > babel.config.json && \
./node_modules/.bin/babel \
  /Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/public/assets/js/src/module-monitor-active-calls-index.js \
  --out-dir /Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/public/assets/js/ \
  --source-maps && \
mv babel.config.json.bak babel.config.json
```
