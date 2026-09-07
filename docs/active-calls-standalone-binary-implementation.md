# Вынос мониторинга активных вызовов в отдельный бинарник

## 1. Назначение документа

Документ описывает фактическую реализацию `ModuleMonitorActiveCalls`, границы её переноса в отдельный долгоживущий процесс и целевой контракт бинарника, который должен обеспечивать:

- достоверное состояние сотрудников и очередей;
- физические каналы Asterisk с точным `X-CHAN-ID`;
- корректную обработку параллельных устройств, `Local/*`, очередей, переводов и pickup;
- полный снимок после запуска и переподключения;
- событийные обновления без ожидания периодического опроса;
- персонализацию `/sub/me/users-state` по авторизованному пользователю;
- обратную совместимость текущего JSON-контракта.

Все ссылки ниже указывают на абсолютные пути (`realpath`) исходников, изученных 2026-09-06.

## 2. Важное замечание о текущем состоянии

Проверенная версия решает значительную часть задачи: восстанавливает каналы и bridge из AMI, отслеживает смену `linkedid` при pickup/transfer, строит состояния сотрудников и публикует персонализированные снимки через `ModuleSoftphoneBackend`. Однако она **не реализует исходную постановку полностью**:

- в `users-state.channels[*]` формируются только `channel`, `number`, `direction`; полей `linkedid`, `uniqueid`, `channelId`, `answerState` нет ([WorkerActiveCalls.php:643](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:643));
- фильтр backend разрешает только те же три поля, поэтому даже добавленные producer-ом поля сейчас были бы удалены ([CallAccessFilter.php:90](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/Authorization/CallAccessFilter.php:90));
- `direction` определяется сравнением с одним `src_chan`, а не конечным автоматом `Dial`/`Bridge`/CEL ([WorkerActiveCalls.php:706](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:706));
- `CALL_EVENTS` не содержит `DialBegin`, `DialEnd`, `BridgeCreate`, `BridgeDestroy`, `ContactStatus` и CEL ([WorkerActiveCalls.php:76](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:76));
- стартовый `CoreShowChannels` пропускает `Local/*` ([WorkerActiveCalls.php:996](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:996));
- повторная публикация раз в 30 секунд отправляет последний сохранённый payload, а не новый снимок Asterisk ([WorkerActiveCalls.php:619](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:619));
- выдаваемая Monitor UI-сессия содержит `contacts:read` и `active-calls:read`, но не `users-state:read`, и не возвращает маршрут `users_state` ([ModuleUiSessionService.php:28](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/ClientAPI/ModuleUiSessionService.php:28));
- очереди исключены из проверки extension scope и поэтому попадают всем подписчикам ([CallAccessFilter.php:45](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/Authorization/CallAccessFilter.php:45)).

Целевой бинарник должен сохранить удачные механизмы текущего кода, но устранить перечисленные ограничения.

## 3. Текущая архитектура

```text
Asterisk AMI
    │ события + CoreShowChannels/BridgeList/QueueStatus/PJSIPShowEndpoints
    ▼
WorkerActiveCalls.php
    ├── in-memory модель каналов, bridge, очередей и pickup
    ├── Redis: getActiveChannelsV2Action / getUsersStates
    └── MonitorActiveCallsMain::publish*()
             │
             ▼
ModuleSoftphoneBackend::ClientActionFactory
    ├── AuthorizationService: scope пользователя
    ├── CallAccessFilter: редактирование payload
    └── Nchan: users-state-user-{userId} / active-calls-user-{userId}
             │
             ▼
    /sub/me/users-state и /sub/me/active-calls
```

### 3.1. Жизненный цикл worker-а

Основной worker:

1. проверяет наличие backend;
2. подключается к AMI с повторными попытками;
3. загружает сотрудников и начальные PJSIP-состояния;
4. получает `CoreShowChannels`, `BridgeList`/`BridgeInfo` и `QueueStatus`;
5. после полного bootstrap начинает публикацию;
6. далее обновляет модель по AMI-событиям и выполняет idle callback раз в секунду.

Код: [WorkerActiveCalls.php:280](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:280), восстановление AMI — [WorkerActiveCalls.php:333](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:333), регистрация фильтров — [WorkerActiveCalls.php:1207](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1207).

Контроль процесса сделан через state-файл `/tmp/MonitorActiveCalls_worker.state` ([WorkerActiveCalls.php:120](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:120)); worker регистрируется в safe-script как `CHECK_BY_PID_NOT_ALERT` ([MonitorActiveCallsConf.php:36](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/Lib/MonitorActiveCallsConf.php:36)).

### 3.2. Текущая in-memory модель

Ключевые структуры объявлены в [WorkerActiveCalls.php:40](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:40):

| Структура | Ключ | Назначение |
|---|---|---|
| `activeChannels` | `linkedid → channel` | AMI-метаданные каждого физического канала |
| `states` | extension | имя, агрегированное состояние, набор каналов |
| `mobileStates` | номер | состояние внешнего участника очереди |
| `activeBridges` | `linkedid → bridgeUniqueid → channel` | граф соединений и время входа |
| `callType` | linkedid | инициирующий канал, тип, DID, start/answer |
| `queueEntryes` | `queue → channel` | ожидающие вызовы очереди |
| `pickupChannels` | channel | цель `*8XXX`, исходный linkedid и время |
| `channelLinkedIds` | channel | последний известный linkedid |
| `linkedIdAliases` | old linkedid | канонический linkedid после masquerade/pickup |

Формат `activeChannels[linkedid][channel]` создаётся при стартовом опросе в [WorkerActiveCalls.php:1021](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1021) и из `Newchannel`/`Newstate` в [WorkerActiveCalls.php:1345](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1345). Он хранит `ChannelStateDesc`, `CallerIDNum`, `ConnectedLineNum`, `Uniqueid`, endpoint, тип, extension и признак application context.

### 3.3. Первоначальный снимок

- `PJSIPShowEndpoints` преобразуется в `Idle`, `Up`, `Unavailable`, `Ringing`; endpoint `NNN-WS` объединяется с `NNN` ([WorkerActiveCalls.php:1115](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1115)).
- список сотрудников берётся из моделей `Extensions` ([WorkerActiveCalls.php:1158](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1158)).
- активные каналы берутся через `CoreShowChannels`, сгруппированный по `Linkedid` ([LegacyAsteriskManager.php:859](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/Lib/LegacyAsteriskManager.php:859)). Для каждого канала дополнительные поля читаются отдельными `GetVar`.
- bridge восстанавливаются через `BridgeList` и `BridgeInfo`, затем синтетически проигрываются как `BridgeEnter` ([WorkerActiveCalls.php:368](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:368)).
- очереди и ожидающие абоненты восстанавливаются через модели и `QueueStatus` ([WorkerActiveCalls.php:946](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:946)).

### 3.4. Событийная обработка

`callEvents()` обрабатывает:

- `Newchannel`/`Newstate`: создаёт или обновляет физический канал и состояние endpoint-а;
- `NewCallerid`, `NewConnectedLine`: уточняет стороны;
- `BridgeEnter`/`BridgeLeave`: меняет bridge-граф;
- `Hangup`: удаляет канал, сбрасывает endpoint в `Idle` после последнего канала;
- `ChanSpyStart`/`ChanSpyStop`: отмечает прослушивание;
- `UserEvent`: ping/config refresh.

Основной код: [WorkerActiveCalls.php:1249](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1249). Очереди обновляются отдельно в [WorkerActiveCalls.php:1594](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1594), регистрационное/device state — через `ExtensionStatus` в [WorkerActiveCalls.php:1646](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1646).

### 3.5. Local-каналы, bridge и pickup

`findBridgeChannel()` проходит цепочку bridge, переключает `Local/...;1 ↔ Local/...;2` и продолжает до физического плеча ([WorkerActiveCalls.php:852](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:852)).

При pickup/transfer Asterisk может изменить `Linkedid`. Текущая реализация:

- распознаёт вызов `*8XXX` и запоминает pickup-канал ([WorkerActiveCalls.php:1334](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1334));
- обрабатывает `SwapUniqueid`;
- ищет уже известный канал под другим linkedid;
- переносит channel metadata, call metadata, bridge и spy data через `migrateChannel()` ([WorkerActiveCalls.php:792](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:792));
- создаёт алиасы linkedid для последующего обхода bridge ([WorkerActiveCalls.php:1401](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1401)).

Этот механизм следует перенести как защиту от masquerade, но заменить эвристики явным индексом `uniqueid → channel record` и графом связей.

### 3.6. Формирование и публикация

`printActiveCalls()` строит два представления:

- `{queues, calls}` для старого Monitor UI;
- `{states: {extension: {name, state, channels}}}` для клиентов presence.

Изменения определяются MD5 полного JSON. Active calls публикуются немедленно, users-state — с debounce 200 мс ([WorkerActiveCalls.php:535](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:535), [WorkerActiveCalls.php:580](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:580)). Redis использует DB 3 и префикс `ModuleMonitorActiveCalls_` ([CacheManager.php:28](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/Lib/CacheManager.php:28)).

Адаптер выбирает современный или legacy backend и вызывает `publishActiveCalls`/`publishUserStates` ([MonitorActiveCallsMain.php:153](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/Lib/MonitorActiveCallsMain.php:153)). Backend сохраняет raw snapshot, строит `AuthorizationContext` для каждого пользователя, фильтрует payload и публикует в персональный Nchan channel ([ClientActionFactory.php:1291](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/ClientAPI/ClientActionFactory.php:1291), [ClientActionFactory.php:1344](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/ClientAPI/ClientActionFactory.php:1344)).

## 4. Целевая граница отдельного бинарника

### 4.1. Что переносится

В бинарник переносится весь state engine:

- AMI connect/reconnect и подписки;
- bootstrap из `CoreShowChannels`, `BridgeList`/`BridgeInfo`, `QueueStatus`, `PJSIPShowEndpoints` либо `ExtensionStateList`;
- нормализация событий;
- реестр физических каналов;
- граф Dial/Bridge/Local;
- вычисление employee state и channel payload;
- reconciliation, debounce, журналирование и health state;
- выдача полного raw snapshot и последовательных обновлений.

### 4.2. Что не следует переносить в state engine

Авторизацию MikoPBX, JWT, группы доступа и Nchan admission целесообразно оставить в `ModuleSoftphoneBackend`:

- идентичность подписчика извлекается из проверенного JWT, а не из входного номера ([SubscriptionAccessAction.php:24](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/ClientAPI/Actions/Admission/SubscriptionAccessAction.php:24));
- Nginx связывает subject токена с `users-state-user-{id}` ([SoftphoneBackendConf.php:586](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/SoftphoneBackendConf.php:586));
- права и extension scope строятся из групп/ролей ([AuthorizationService.php:14](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/Authorization/AuthorizationService.php:14), [AuthorizationRepository.php:20](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/Authorization/AuthorizationRepository.php:20)).

Бинарник должен быть источником **raw truth**, а PHP/backend — security boundary. Нельзя публиковать raw snapshot напрямую в доступный клиенту Nchan channel.

### 4.3. Рекомендуемый стык binary → backend

Добавить localhost-only ingest API или Unix domain socket:

```http
PUT /internal/monitor-snapshot/users-state
Content-Type: application/json
X-Producer-Instance: <boot UUID>
X-Sequence: <uint64>

{
  "schemaVersion": 2,
  "kind": "full",
  "instanceId": "...",
  "sequence": 1842,
  "generatedAt": 1788183285.412,
  "states": { ... }
}
```

Backend обязан принять payload только с loopback/Unix socket, ограничить размер и глубину JSON, проверить schema и монотонность `(instanceId, sequence)`, затем вызвать существующую персонализацию. Прямой POST бинарника в `/pub/users-state-user-{id}` запрещён: это позволило бы producer-у обойти ACL-фильтр.

Для rollout можно сохранить PHP-обёртку `MonitorActiveCallsMain::publish*()`, читающую IPC бинарника. После стабилизации worker PHP удаляется из `getModuleWorkers()`, а safe-script контролирует PID/health бинарника.

## 5. Целевая модель данных бинарника

### 5.1. ChannelRecord

Каждый физический канал хранится отдельно и адресуется полным именем:

```text
ChannelRecord {
  name, technology, endpoint, channelId,
  uniqueid, linkedid, creationTime,
  callerNumber, connectedNumber, exten, context,
  astState, answerState,
  dialRole, dialPeerUniqueid,
  bridgeIds[], parentLocalUniqueid?,
  queueId?, pickupTarget?, hangupCause?
}
```

Правила:

- `channelId` извлекается только из суффикса полного PJSIP-канала: для `PJSIP/268-000003d8` это `000003d8`;
- identity канала — `uniqueid`, а полное имя является адресом для `PickupChan`;
- `linkedid` индексирует вызов, но не является неизменяемым primary key;
- изменение linkedid не создаёт второй канал: запись перемещается, а старый linkedid становится alias;
- `Local/*;1` и `Local/*;2` сохраняются во внутреннем графе, даже если не выдаются как employee physical channel.

### 5.2. CallGraph

Вместо поиска только по первому/последнему элементу bridge бинарник поддерживает граф:

```text
uniqueid ──Dial──> uniqueid
uniqueid ──member-of──> bridgeUniqueid
Local/...;1 ──local-pair──> Local/...;2
old linkedid ──alias──> canonical linkedid
```

Индексы: `byUniqueid`, `byFullChannel`, `byLinkedid`, `byEndpoint`, `bridgeMembers`, `dialEdges`, `localPairs`. Все операции должны быть идемпотентны, поскольку AMI может доставлять повторные или неполные события.

### 5.3. EmployeeState

```json
{
  "268": {
    "name": "Тест",
    "state": "Ringing",
    "channels": {
      "PJSIP/268-000003d8": {
        "channel": "PJSIP/269-000003d9",
        "number": "269",
        "direction": "incoming",
        "linkedid": "mikopbx-1788183285.2108",
        "uniqueid": "mikopbx-1788183285.2110",
        "channelId": "000003d8",
        "answerState": "ringing",
        "pickupAvailable": true
      }
    }
  }
}
```

`channels` рекомендуется всегда передавать объектом `{}`, включая пустое значение: это соответствует заявленному контракту и упрощает очистку старого состояния. Старые клиенты продолжат читать существующие поля.

### 5.4. Приоритет агрегированного состояния

Состояние сотрудника вычисляется из всех его физических каналов и регистрации:

1. `Up`/`InUse`, если есть отвеченный или bridged канал;
2. `Ringing`, если есть доступное для ответа входящее плечо;
3. `Unavailable`, если нет активных каналов и ни одно устройство не зарегистрировано;
4. `Idle` во всех остальных случаях.

`Ringing` проигравших fork-плеч должно исчезнуть сразу после `BridgeEnter`/answer другого устройства того же dial attempt. Каналы можно сохранить до `Hangup` для диагностики, но `pickupAvailable=false`, `answerState=cancelled` и агрегированное состояние уже не должно быть `Ringing`.

## 6. Конечный автомат канала и направление

### 6.1. События, которые нужно подписать

Минимальный набор:

- `Newchannel`, `Newstate`, `NewCallerid`, `NewConnectedLine`, `Hangup`;
- `DialBegin`, `DialEnd`;
- `BridgeCreate`, `BridgeEnter`, `BridgeLeave`, `BridgeDestroy`;
- `BlindTransfer`, `AttendedTransfer`, `LocalOptimizationBegin/End` при наличии в версии Asterisk;
- `QueueCallerJoin`, `QueueCallerLeave`, `AgentCalled`, `AgentConnect`, `AgentComplete`, `QueueMemberStatus`;
- `ContactStatus` и/или `PeerStatus`, `ExtensionStatus`;
- CEL как дополнительный источник восстановления причинно-следственной связи, если AMI Dial/Bridge недостаточно.

### 6.2. `answerState`

Нормализованные значения:

- `new` — канал создан;
- `dialing` — исходящее плечо инициировало Dial;
- `ringing` — вызываемое плечо реально звонит;
- `answered` — получено состояние `Up`, но bridge ещё не подтверждён;
- `bridged` — канал состоит в bridge с живым peer;
- `held` — удержание;
- `cancelled` — другое fork-плечо ответило;
- `ended` — канал завершён.

### 6.3. `direction` относительно сотрудника

- `incoming`: employee channel является destination Dial edge, находится в `ringing`, не отвечен и не bridged;
- `outgoing`: employee channel является инициатором Dial edge;
- `answered`: employee channel ответил, но bridge ещё не подтверждён;
- `bridged`: employee channel находится в установленном bridge;
- при transfer направление пересчитывается по текущей роли, а не навсегда наследуется от CallerID.

CallerID и ConnectedLine используются только для номера собеседника. Они не являются доказательством направления.

## 7. Определение связанного канала

Для employee channel `C` peer выбирается так:

1. если `C` в bridge — пройти членов bridge и `Local`-пары до первого живого физического канала другой стороны;
2. если bridge ещё нет — использовать Dial edge `source → destination`;
3. для очереди учитывать `AgentCalled` и соответствующий вызываемый agent channel;
4. при transfer использовать новые bridge/Dial edges и alias linkedid;
5. если peer неоднозначен, `channel=""`, но собственный полный канал и его идентификаторы всё равно сохраняются.

Текущий алгоритм обхода можно использовать как reference ([WorkerActiveCalls.php:852](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:852)), но бинарник не должен зависеть от порядка элементов associative array в bridge.

## 8. Pickup

### 8.1. Условие показа

`pickupAvailable=true` только если одновременно:

- канал принадлежит целевому сотруднику;
- это полный `PJSIP/<extension>-<channelId>`;
- `direction=incoming`;
- `answerState=ringing`;
- канал ещё существует в последнем reconciliation snapshot;
- ни одно параллельное плечо того же Dial/linkedid не ответило;
- backend ACL разрешает `call.pickup` для цели.

Для caller, отвеченного/bridged канала и неизвестного точного канала значение должно быть `false`. Совместимый fallback `PJSIP/<extension>` допустим только как явно маркированный legacy fallback, а не как `pickupAvailable=true` в новом протоколе.

### 8.2. Защищённое выполнение

Текущий dialplan:

- отключает CDR для `*pickup*`;
- читает `X-NUMBER`, action ticket и endpoint инициатора;
- вызывает AGI-проверку прав;
- добавляет `X-CHAN-ID` к `PJSIP/<number>`;
- выполняет `PickupChan`.

Код: [SoftphoneBackendConf.php:953](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/SoftphoneBackendConf.php:953). Заголовок `X-CHAN-ID` исходящего плеча формируется в [SoftphoneBackendConf.php:895](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/SoftphoneBackendConf.php:895). Повторная проверка ticket, scope, состояния звонка и принадлежности цели выполняется в [authorize-supervisor.php:42](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/agi-bin/authorize-supervisor.php:42).

Бинарник не выполняет pickup сам и не принимает решение об ACL; он поставляет точный канал и фактическое состояние, а backend/dialplan повторно авторизует действие непосредственно перед `PickupChan`.

## 9. Снимки, инкременты и восстановление

### 9.1. Bootstrap

До публикации первого `ready=true` бинарник обязан выполнить согласованный bootstrap:

1. открыть AMI и установить фильтры;
2. начать буферизацию входящих событий;
3. запросить каналы, bridge, endpoint states и очереди;
4. построить модель из snapshot;
5. применить буфер событий, пришедших после начала snapshot;
6. опубликовать полный снимок с новым `instanceId` и `sequence=1`;
7. перейти к live events.

Так устраняется окно потери событий между запросами и запуском listener-а.

### 9.2. Переподключение клиента

Nchan channel должен иметь buffer length 1; последний **полный персонализированный** снимок немедленно выдаётся новому подписчику. Текущая конфигурация buffer=1 находится в [SoftphoneBackendConf.php:586](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/SoftphoneBackendConf.php:586). Периодическая публикация не должна быть механизмом первичной синхронизации.

Если используются delta-сообщения, Nchan buffer=1 недостаточен. Тогда нужны либо:

- всегда полные snapshot в WebSocket (рекомендуется для текущего небольшого объёма);
- отдельный authenticated `GET /me/users-state` для snapshot и delta stream с sequence/gap recovery.

### 9.3. Reconciliation

Каждые 15–30 секунд и после AMI reconnect бинарник повторно запрашивает фактические каналы/bridge/endpoint states. Отсутствующий канал удаляется, даже если `Hangup` был потерян. Публикуется новый snapshot только после успешного полного опроса; ошибка AMI не считается доказательством завершения всех вызовов. Аналогичная защита уже есть в [WorkerActiveCalls.php:169](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:169).

## 10. Авторизация и фильтрация

### 10.1. Поток идентичности

1. Monitor controller получает user ID из серверной сессии, а не из request body ([ModuleMonitorActiveCallsController.php:152](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/App/Controllers/ModuleMonitorActiveCallsController.php:152), [ModuleMonitorActiveCallsController.php:231](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/App/Controllers/ModuleMonitorActiveCallsController.php:231)).
2. Backend выдаёт ограниченный `module_ui` JWT.
3. Nginx admission проверяет token type/audience/scope и получает user ID из `sub`.
4. Подписчик привязывается только к персональному channel.
5. Publisher строит `AuthorizationContext` и фильтрует raw snapshot до помещения в этот channel.

### 10.2. Обязательные изменения backend

- добавить `users-state:read` и маршрут `/sub/me/users-state` в UI session;
- расширить allowlist channel payload полями `linkedid`, `uniqueid`, `channelId`, `answerState`, `pickupAvailable`;
- `pickupAvailable` вычислять как пересечение факта producer-а и `Permission::CALL_PICKUP`;
- не передавать queue всем автоматически: определить queue scope через разрешённые группы/участников;
- валидировать полные имена каналов по строгому шаблону и не передавать произвольные AMI variables;
- исключать SIP secret, auth username/password, JWT, action ticket и внутренние заголовки;
- инвалидировать cached authorization representations при изменении групп.

Текущие permission names определены в [Permission.php:5](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/Authorization/Permission.php:5), context cache имеет TTL 60 секунд ([AuthorizationRepository.php:16](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/Authorization/AuthorizationRepository.php:16)).

## 11. Очереди и несколько устройств

- Каждый `PJSIP/268-*` — отдельная запись независимо от endpoint `268` или `268-WS`.
- Endpoint normalization должна убирать только известный device suffix (`-WS`), не произвольный `-...`.
- Одна employee state агрегирует все регистрации и каналы.
- Answer/bridge одного fork-плеча атомарно отменяет pickup у остальных плеч того же Dial attempt.
- Очередь выдаётся с `isQueue=true`, `name`, `state`, `channels={}`; её состояние не должно подменять состояния агентов.
- `QueueCallerJoin/Leave` определяют ожидание, `AgentCalled` связывает попытку с агентом, `AgentConnect` подтверждает ответ.
- AMI Originate обрабатывается по фактическим `Newchannel`/`Dial`/`Bridge` событиям; context и CallerID не должны быть единственным классификатором.

## 12. Надёжность, производительность и диагностика

### 12.1. Надёжность

- reconnect с bounded backoff и jitter;
- после reconnect — обязательный полный bootstrap;
- лимиты на число channels/bridges и длину строк;
- защита от циклов alias/local/bridge;
- monotonic sequence и boot UUID;
- graceful SIGTERM: прекратить приём, допубликовать финальный snapshot при живом AMI, закрыть сокеты;
- readiness только после успешного bootstrap, liveness независимо от доступности publisher-а.

### 12.2. Публикация

Сохранить debounce порядка 100–200 мс, но объединять события по dirty linkedid/endpoint. В отличие от текущего MD5 всего документа, вычислять deterministic hash каждого employee и итогового snapshot. Полный payload публиковать только при изменении либо при новом `instanceId`.

### 12.3. Лог без секретов

Структурированные поля:

```text
event, timestamp, sequence, uniqueid, linkedid, channel,
endpoint, peerChannel, direction, answerState,
pickupAvailable, pickupReason, bridgeId, queueId, source
```

Логировать channel create/update/end, Dial edge, Bridge membership, linkedid migration, employee transition, lost-event reconciliation, full/incremental publish и отказ pickup. Не логировать JWT, SIP-пароли, Authorization, action ticket или полный HTTP query string. Текущий logger вызывается после каждого обработанного AMI-события в [WorkerActiveCalls.php:1578](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1578); в бинарнике лучше логировать нормализованное событие, а не сырой массив целиком.

## 13. Конфигурация и упаковка

Минимальная конфигурация бинарника:

```yaml
ami:
  address: 127.0.0.1:<AMIPort>
  usernameFile: <root-readable file>
  secretFile: <root-readable file>
publisher:
  unixSocket: /run/mikopbx/active-calls.sock
reconcileInterval: 20s
debounce: 150ms
logLevel: info
```

AMI credential нельзя передавать в process arguments или environment. Текущий PHP-код использует одинаковые username/secret `monitor-active-calls` ([MonitorActiveCallsConf.php:20](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/Lib/MonitorActiveCallsConf.php:20), [WorkerActiveCalls.php:1209](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1209)); при выносе предпочтителен сгенерированный секрет с минимальными AMI privileges.

Установщик модуля должен:

- положить бинарник в versioned module directory;
- создать непривилегированного runtime user либо запустить через штатный supervisor MikoPBX;
- создать runtime directory/socket с узкими правами;
- сгенерировать AMI user и конфигурацию;
- зарегистрировать health check и ротацию логов;
- поддерживать атомарное обновление и rollback предыдущего бинарника.

## 14. Совместимость и миграция

1. Ввести `schemaVersion=2`, сохранив корневой `states` и поля `name`, `state`, `channels`, `channel`, `number`, `direction`.
2. Сначала развернуть backend, который понимает новые поля и новый ingest, но принимает старого PHP producer-а.
3. Запустить бинарник в shadow mode: принимать AMI, строить snapshot, сравнивать с PHP без публикации.
4. Сравнивать число каналов, linkedid, employee states, bridge peer и pickup decision.
5. Переключить publisher на бинарник feature flag-ом.
6. Оставить HTTP polling/cache adapter на один релиз.
7. После подтверждения стабильности убрать `WorkerActiveCalls` из списка PHP workers.

Нельзя одновременно публиковать users-state из двух producer-ов. В backend уже существует альтернативный `CoreUserStatusPoller`, который отключает свою публикацию при source `moduleMonitorActiveCalls` ([CoreUserStatusPoller.php:111](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/bin/CoreUserStatusPoller.php:111)); для бинарника нужен отдельный source enum и единоличное владение channel.

## 15. Проверки приёмки бинарника

### Unit

- parser полного имени PJSIP и `channelId`;
- state-machine всех переходов;
- Dial direction относительно каждого плеча;
- bridge graph через несколько Local-пар;
- linkedid migration без дублирования;
- parallel fork: ответ одного отменяет ringing остальных;
- strict pickup predicate;
- queue agent linkage;
- idempotency повторных событий и защита от out-of-order events.

### Replay

Записывать обезличенные AMI event fixtures и воспроизводить сценарии:

- `233 → 268`;
- два устройства `268`;
- входящий вызов через очередь;
- AMI Originate через Local;
- blind/attended transfer;
- pickup третьим сотрудником;
- потерянный `Hangup` с последующим reconciliation;
- restart посреди разговора.

### Integration

- новый WebSocket немедленно получает полный персонализированный snapshot;
- `268` получает `PJSIP/268-000003d8`, `channelId=000003d8`, `incoming/ringing`;
- caller `233` не получает pickup capability;
- `204` получает capability только при наличии permission и выполняет `PickupChan(PJSIP/268-000003d8)`;
- `*pickup*` не создаёт CDR history row;
- скрытые extensions и их parties отсутствуют в JSON, Redis representation cache и Nchan;
- после answer/hangup изменение приходит в пределах debounce SLA;
- legacy client успешно игнорирует новые поля.

## 16. Карта исходников для переноса

| Область | Основной reference |
|---|---|
| Worker lifecycle и bootstrap | [WorkerActiveCalls.php:280](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:280) |
| Reconciliation | [WorkerActiveCalls.php:169](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:169) |
| Active calls projection | [WorkerActiveCalls.php:386](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:386) |
| Presence/channel projection | [WorkerActiveCalls.php:643](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:643) |
| Bridge traversal | [WorkerActiveCalls.php:852](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:852) |
| Initial channel snapshot | [WorkerActiveCalls.php:996](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:996) |
| Endpoint snapshot | [WorkerActiveCalls.php:1115](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1115) |
| AMI filters | [WorkerActiveCalls.php:1207](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1207) |
| Call event reducer | [WorkerActiveCalls.php:1249](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1249) |
| Queue reducer | [WorkerActiveCalls.php:1594](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1594) |
| Endpoint state reducer | [WorkerActiveCalls.php:1646](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1646) |
| Backend adapter | [MonitorActiveCallsMain.php:83](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/Lib/MonitorActiveCallsMain.php:83) |
| Per-user publication | [ClientActionFactory.php:1291](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/ClientAPI/ClientActionFactory.php:1291) |
| ACL filter | [CallAccessFilter.php:31](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/Authorization/CallAccessFilter.php:31) |
| Authorization context | [AuthorizationService.php:14](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/Authorization/AuthorizationService.php:14) |
| Nchan personal channel | [SoftphoneBackendConf.php:586](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/SoftphoneBackendConf.php:586) |
| Protected pickup dialplan | [SoftphoneBackendConf.php:953](/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend/Lib/SoftphoneBackendConf.php:953) |
