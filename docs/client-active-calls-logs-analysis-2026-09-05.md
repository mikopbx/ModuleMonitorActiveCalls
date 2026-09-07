# Анализ клиентских логов Active Calls от 2026-09-05

## Исходные данные

Проанализированы две пары логов:

- [ActiveCallsLog.txt](/Volumes/DevDisk/apor/Downloads/ActiveCalls/ActiveCallsLog.txt)
- [VerboseLog.txt](/Volumes/DevDisk/apor/Downloads/ActiveCalls/VerboseLog.txt)
- [ActiveCallsLog-2.txt](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt)
- [VerboseLog-2.txt](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt)

Проверяемый сценарий:

- входящий или внутренний вызов проходит через IVR 6642;
- вызывается фиктивный сотрудник 013;
- с 013 настроена переадресация на очередь 6013;
- участники очереди: SIP-сотрудники 132 и 134, внешние номера `79161231313` и `79154628591`;
- проверяется поведение DND, отключённого SIP-устройства, выключенного мобильного и повторных попыток очереди.

Первая пара логов частично рассинхронизирована: `ActiveCallsLog.txt` начинается в 16:28:13, а `VerboseLog.txt` — только в 16:29:44. Поэтому ранние шаги первого теста нельзя восстановить полностью. Вторая пара синхронна и однозначно показывает повторные циклы очереди и сохранение исходного вызова до 19:23:15.

## Краткие выводы

| Наблюдение клиента | Фактическая причина |
|---|---|
| DND сразу не отображается | У ModuleMonitorActiveCalls нет отдельного источника DND; он ждёт изменения Asterisk hint |
| После попытки звонка сотрудник становится серым | Asterisk уточняет device state во время Dial |
| Затем сотрудник снова становится зелёным | Asterisk присылает `ExtensionStatus=Idle`; дополнительно модуль сам ставит `Idle` после `Hangup` последнего канала |
| Отключённый мобильный отображается зелёным | Для внешнего Local-member состояние `Status=1` трактуется как `Idle`, хотя оно не подтверждает доступность мобильного телефона |
| Мобильный вызывается снова и снова | Повторы выполняет Asterisk `app_queue`; один цикл длится около 36 секунд, общий timeout очереди равен 3600 секунд |
| Вызов исчезает из нижней таблицы | ModuleMonitorActiveCalls переносит queue call из корневого массива `calls` в `queues[queue].calls`, хотя вызов и linkedid продолжают существовать |

## 1. Почему DND отображается только после звонка

ModuleMonitorActiveCalls не получает самостоятельного события «пользователь включил DND». Он показывает состояние составного Asterisk hint:

```text
PJSIP/132&Custom:132
PJSIP/134&Custom:134
```

После включения DND карточки могут оставаться зелёными до тех пор, пока состояние `Custom:<номер>` или всего hint не изменится. Во время попытки вызова Asterisk уточняет device state, после чего модуль получает соответствующее AMI-событие.

### Подтверждение из логов

Во время звонка 132 получает состояние `Ringing`:

- [ActiveCallsLog.txt:46](/Volumes/DevDisk/apor/Downloads/ActiveCalls/ActiveCallsLog.txt:46) — `ExtensionStatus`, `Exten=132`, `Status=8`, `StatusText=Ringing`.

После завершения попытки Asterisk почти сразу возвращает SIP-сотрудникам `Idle`:

- [ActiveCallsLog.txt:67](/Volumes/DevDisk/apor/Downloads/ActiveCalls/ActiveCallsLog.txt:67) — 134 получает `Status=0`, `StatusText=Idle` в 16:28:19;
- [ActiveCallsLog.txt:74](/Volumes/DevDisk/apor/Downloads/ActiveCalls/ActiveCallsLog.txt:74) — 132 получает `Status=0`, `StatusText=Idle` в 16:28:19.

Таким образом, в данном тесте возврат в зелёный произошёл примерно через четыре секунды после начала звонка. Это не периодическая перепроверка регистрации через 2–3 минуты, а явное AMI-событие `ExtensionStatus=Idle`.

### Дополнительное влияние ModuleMonitorActiveCalls

При `Hangup` worker удаляет канал из сотрудника и, если других известных каналов не осталось, безусловно устанавливает `Idle`:

[WorkerActiveCalls.php:1284](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1284)

```php
unset($this->activeChannels[$foundLinkedId][$channel]);
unset($this->states[$endpoint]['channels'][$channel]);

if (isset($this->states[$endpoint]) && empty($this->states[$endpoint]['channels'])) {
    $this->states[$endpoint]['state'] = self::STATE_IDLE;
}
```

Такое поведение может перезаписать более правильное состояние `Unavailable` или DND: отсутствие активных каналов не доказывает, что устройство зарегистрировано и доступно.

### Полное отключение 132

Когда 132 действительно отключили, Asterisk прислал отдельное событие:

- [ActiveCallsLog.txt:242](/Volumes/DevDisk/apor/Downloads/ActiveCalls/ActiveCallsLog.txt:242) — `ExtensionStatus`, `Exten=132`, `Status=4`, `StatusText=Unavailable` в 16:31:13.

Это произошло примерно через 31 секунду после завершения предыдущего вызова, а не через несколько минут.

### Вывод по DND и регистрации

Корректное состояние сотрудника должно вычисляться из трёх независимых источников:

1. наличие зарегистрированных PJSIP-контактов;
2. состояние `Custom:<номер>` или другой явный источник DND;
3. фактические активные каналы сотрудника.

`Hangup` должен удалять канал и пересчитывать состояние по этим источникам, но не назначать `Idle` безусловно.

## 2. Почему выключенный мобильный всегда зелёный

Внешние мобильные участники очереди не регистрируются на MikoPBX как SIP-устройства. У АТС нет постоянного регистрационного состояния такого телефона.

При первоначальной загрузке ModuleMonitorActiveCalls создаёт все внешние номера со статусом `Idle`:

[WorkerActiveCalls.php:1171](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:1171)

```php
} else {
    $this->mobileStates[$extension->number] = [
        'state' => self::STATE_IDLE,
        'name' => $extension->callerid,
        'channels' => []
    ];
}
```

Во время набора очередь передаёт состояние Local-member:

- `Status=2` — member сейчас используется;
- `Status=1` — member сейчас не используется.

Для `79154628591` во втором тесте:

- [ActiveCallsLog-2.txt:18](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt:18) — начало первой попытки, `QueueMemberStatus=2`;
- [ActiveCallsLog-2.txt:34](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt:34) — завершение попытки, `QueueMemberStatus=1`;
- [ActiveCallsLog-2.txt:41](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt:41) — начало следующей попытки, снова `Status=2`.

Worker преобразует queue status в состояние карточки по таблице:

[WorkerActiveCalls.php:90](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:90)

```php
public const QUEUE_AGENT_STATES = [
    '0' => self::STATE_UNAVAILABLE,
    '1' => self::STATE_IDLE,
    '2' => self::STATE_BUSY,
    '3' => self::STATE_BUSY,
    '4' => self::STATE_UNAVAILABLE,
    '6' => self::STATE_RINGING,
    '7' => self::STATE_ONHOLD,
];
```

Для внешнего номера `Status=1` означает только «Local-member очереди сейчас не занят». Оно не означает, что мобильный телефон включён, зарегистрирован в сети и способен принять вызов.

### Влияние автоответчика оператора

Когда телефон выключен или находится вне зоны действия сети, оператор может:

- принять вызов на своей стороне;
- передать progress или early media;
- воспроизвести голосовое сообщение;
- завершить вызов спустя 15–20 секунд.

По такому поведению нельзя надёжно установить долговременный статус мобильного телефона. После завершения очередной Local-попытки Asterisk снова считает member свободным, и модуль отображает его зелёным.

### Рекомендуемая семантика

Для внешних участников очереди следует использовать отдельный тип состояния, например:

```text
External / Unknown
```

Можно отдельно показывать оперативное состояние попытки:

- `Idle` — сейчас не вызывается;
- `Calling` — выполняется исходящий вызов;
- `Answered` — операторская сторона ответила;
- `Failed` — последняя попытка завершилась ошибкой.

Но зелёный цвет не должен означать подтверждённую доступность внешнего телефона.

## 3. Кто выполняет повторные звонки

Повторные наборы выполняет Asterisk `app_queue`, а не ModuleMonitorActiveCalls.

В Verbose зафиксирован вызов приложения Queue:

- [VerboseLog-2.txt:81](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:81)

```text
Queue(PJSIP/134-00000030,
      QUEUE-9EE683B6FFE495E0DB9E2F3F1EEDC216,
      kT,,,3600,,,queue_agent_answer)
```

Число `3600` задаёт максимальное время нахождения исходного вызова в очереди — один час.

### Временная шкала повторов

| Время | Событие |
|---|---|
| 19:21:16 | Первый `Called Local/79154628591@internal/n` |
| 19:21:52 | `Nobody picked up in 36000 ms` |
| 19:21:53 | Второй вызов того же member |
| 19:22:29 | `Nobody picked up in 36000 ms` |
| 19:22:34 | Третий вызов |
| 19:23:10 | `Nobody picked up in 36000 ms` |
| 19:23:11 | Четвёртый вызов |
| 19:23:15 | Исходный абонент завершает вызов, очередь прекращается |

Подтверждающие строки:

- первая попытка: [VerboseLog-2.txt:84](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:84);
- первый timeout: [VerboseLog-2.txt:291](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:291);
- второй набор: [VerboseLog-2.txt:293](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:293);
- второй timeout: [VerboseLog-2.txt:500](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:500);
- третий набор: [VerboseLog-2.txt:506](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:506);
- третий timeout: [VerboseLog-2.txt:713](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:713);
- четвёртый набор: [VerboseLog-2.txt:715](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:715).

Все эти попытки относятся к одному исходному вызову:

```text
linkedid=mikopbx-1788625275.130
```

Каждая попытка создаёт новую пару `Local/*;1` и `Local/*;2` и новые провайдерские PJSIP-каналы, но корневой канал `PJSIP/134-00000030` остаётся тем же.

### Почему один цикл занимает около 36 секунд

В Verbose явно присутствует:

```text
Nobody picked up in 36000 ms
```

Внутри одного цикла MikoPBX также пробует несколько исходящих маршрутов или провайдерских плеч. Например, в первой попытке появляются:

- `PJSIP/SIP-4CF94A7E-00000031`;
- `PJSIP/SIP-E2ED5510-00000032`;
- `PJSIP/SIP-4CF94A7E-00000033`.

Один из маршрутов возвращает `Unallocated (unassigned) number`, другие завершаются как `Normal, unspecified`. После исчерпания 36-секундной попытки `app_queue` снова вызывает того же доступного member.

### Как ограничить число повторов

Эта настройка относится к очереди или dialplan, не к Active Calls. Возможные варианты:

- уменьшить общий timeout очереди, который сейчас равен 3600 секундам;
- уменьшить время вызова одного агента;
- увеличить интервал `retry` между циклами;
- настроить выход из очереди или перевод после заданного времени;
- если требуется именно «не более N попыток конкретному агенту», добавить специальную логику dialplan/очереди со счётчиком.

Стандартное сочетание timeout/retry ограничивает продолжительность ожидания, но само по себе не задаёт простой per-agent лимит количества попыток.

## 4. Почему активный вызов исчезает из нижней таблицы

### Вызов в Asterisk продолжал существовать

По второй паре логов:

- [ActiveCallsLog-2.txt:13](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt:13) — `QueueCallerJoin` в 19:21:16;
- все повторные внешние плечи имеют `linkedid=mikopbx-1788625275.130`;
- [ActiveCallsLog-2.txt:93](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt:93) — `QueueCallerLeave` только в 19:23:15;
- [ActiveCallsLog-2.txt:95](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt:95) — исходный `PJSIP/134-00000030` завершается также только в 19:23:15.

Следовательно, Asterisk не потерял исходный вызов после первого разрыва мобильного плеча.

### Причина находится в проекции ModuleMonitorActiveCalls

`printActiveCalls()` делит вызовы на две взаимоисключающие коллекции:

[WorkerActiveCalls.php:510](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/bin/WorkerActiveCalls.php:510)

```php
if (empty($call['lastQueue'])) {
    $calls[] = $call;
} else {
    $queuesData[$call['lastQueue']]['calls'][] = $call;
}
```

После присвоения `lastQueue` queue call исключается из корневого массива `calls` и переносится в:

```text
queues[queueId].calls
```

Нижняя таблица отображает только корневой массив `calls`:

- [index.volt:180](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/App/Views/index.volt:180).

Вызовы выбранной очереди показываются отдельно в блоке очереди:

- [index.volt:85](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/App/Views/index.volt:85);
- [index.volt:96](/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls/App/Views/index.volt:96).

Вероятный порядок наблюдения в браузере:

1. новый вызов кратковременно появляется в общей таблице до обработки `QueueCallerJoin`;
2. worker получает `QueueCallerJoin` и устанавливает `lastQueue`;
3. следующее WebSocket-обновление переносит вызов в структуру очереди;
4. заметным это становится после завершения первого внешнего плеча, когда UI получает очередной snapshot;
5. фактически вызов остаётся активным до `QueueCallerLeave` в 19:23:15.

### Варианты исправления

Если нижняя таблица должна показывать все активные вызовы, включая очередь, возможны два безопасных варианта:

1. оставлять каждый вызов в корневом `calls`, а в очереди хранить только его `linkedid`;
2. держать единый call registry по `linkedid`, а `queues[queueId]` использовать как индекс или фильтр.

Дублировать две независимые изменяемые копии одного вызова нежелательно: они могут разойтись при завершении отдельного плеча.

## 5. Дополнительные наблюдения

### 5.1. Queue-member 134 является инициатором второго теста

Во второй паре логов исходный канал:

```text
PJSIP/134-00000030
```

Он звонит на 013, получает `CHANUNAVAIL`, переводится на 6013 и затем сам удерживается приложением Queue. Поэтому 134 становится `Busy`, но не может одновременно выступать нормальным свободным агентом той же очереди.

Это видно в:

- [ActiveCallsLog-2.txt:1](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt:1) — создание `PJSIP/134-00000030`;
- [ActiveCallsLog-2.txt:7](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/ActiveCallsLog-2.txt:7) — `ExtensionStatus=Busy`;
- [VerboseLog-2.txt:81](/Volumes/DevDisk/apor/Downloads/ActiveCalls-2/VerboseLog-2.txt:81) — этот же канал входит в Queue.

### 5.2. `QueueMemberStatus=1` и `ExtensionStatus=Idle` — разные понятия

Их нельзя объединять одной семантикой:

- `ExtensionStatus` относится к Asterisk hint сотрудника;
- `QueueMemberStatus` относится к доступности интерфейса в конкретной очереди;
- для Local/mobile member `QueueMemberStatus=1` ничего не говорит о регистрации конечного телефона;
- `Paused`, `InCall`, `Ringinuse` также должны учитываться отдельно.

### 5.3. Active Calls не инициирует вызовы

В предоставленных логах ModuleMonitorActiveCalls только слушает AMI и публикует состояние. Новые `Local/*` и PJSIP-плечи создаются `app_queue` и штатным dialplan MikoPBX. Изменение Active Calls не остановит повторные звонки — оно может только корректно их отображать.

## 6. Рекомендуемые изменения ModuleMonitorActiveCalls

### Приоритет 1: исправить статус после Hangup

Не устанавливать `Idle` непосредственно в обработчике `Hangup`. После удаления последнего канала пересчитывать endpoint из:

- актуального PJSIP registration/contact state;
- Asterisk hint;
- DND/custom device state;
- остальных каналов сотрудника.

### Приоритет 2: разделить SIP и внешних агентов

Добавить тип endpoint-а:

```text
sip | external | queue
```

Для `external` не показывать зелёный как подтверждённую доступность. Отображать `Unknown/External`, а состояние текущего набора выводить отдельно.

### Приоритет 3: единый реестр вызовов

Не перемещать вызов между `calls` и `queues[].calls`. Хранить один объект по `linkedid`, а принадлежность очереди представлять полями:

```json
{
  "linkedid": "mikopbx-1788625275.130",
  "queueId": "QUEUE-9EE683B6FFE495E0DB9E2F3F1EEDC216",
  "inQueue": true
}
```

### Приоритет 4: добавить диагностический snapshot

В журнале полезно фиксировать не только AMI-события, но и итоговую причину состояния:

```text
extension=132
state=Idle
source=ExtensionStatus
registrationContacts=1
dnd=true
activeChannels=0
```

Для queue call:

```text
linkedid=mikopbx-1788625275.130
inRootCalls=true
queueId=...
queueEntryPresent=true
activePhysicalChannels=2
```

Это позволит точно отделить ошибку Asterisk state, reducer-а и клиентской проекции.

## 7. Ответ клиенту в краткой форме

Можно ответить клиенту следующим образом:

> По логам перепроверка регистрации выполнялась не через 2–3 минуты. После завершения попытки Asterisk почти сразу прислал для 132 и 134 состояние Idle, поэтому модуль снова окрасил их зелёным. При полном отключении 132 состояние Unavailable пришло приблизительно через 31 секунду.
>
> Для мобильного участника зелёный цвет сейчас означает только, что его интерфейс Local не занят очередным вызовом. Это не подтверждает, что сам мобильный телефон включён или доступен в сети. Для внешних участников такое отображение нужно изменить на отдельное состояние.
>
> Повторные звонки выполняет штатная очередь Asterisk, не модуль Active Calls. В текущей конфигурации одна попытка длится 36 секунд, а общий timeout очереди установлен в 3600 секунд, поэтому очередь продолжает вызывать доступного участника. Ограничение следует настраивать в очереди или dialplan.
>
> Исходный вызов после первого разрыва не завершился: он оставался в очереди до 19:23:15. Из нижней таблицы он исчез из-за того, что модуль переносит вызовы очереди из общего списка в отдельный список выбранной очереди. Это поведение отображения, а не потеря вызова Asterisk.
