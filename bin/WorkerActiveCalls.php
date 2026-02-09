<?php
/*
 * MikoPBX - free phone system for small business
 * Copyright © 2017-2023 Alexey Portnov and Nikolay Beketov
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */
namespace Modules\ModuleMonitorActiveCalls\bin;

use MikoPBX\Common\Models\CallQueueMembers;
use MikoPBX\Common\Models\CallQueues;
use MikoPBX\Common\Models\Extensions;
use MikoPBX\Common\Models\PbxSettings;
use MikoPBX\Core\System\SystemMessages;
use Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager as CustomAsteriskManager;
use MikoPBX\Core\Workers\WorkerBase;
use MikoPBX\Core\System\Util;
use Modules\ModuleMonitorActiveCalls\Lib\CacheManager;
use Modules\ModuleMonitorActiveCalls\Lib\Logger;
use Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsConf;
use Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsMain;
use Modules\ModuleSoftphoneBackend\Lib\RestAPI\Controllers\ApiController AS BackendApiController;

require_once 'Globals.php';

class WorkerActiveCalls extends WorkerBase
{
    public Logger $logger;

    private  bool $backendExists = false;
    private bool $init = true;
    private string $lastPrintHash = '';
    private string $lastPrintUserHash = '';
    private int $lastControlActiveCalls = 0;
    protected CustomAsteriskManager $amCustom;
    private array $activeChannels = [];
    private array $states = [];
    private array $mobileStates = [];
    private array $activeBridges = [];
    private array $callType = [];
    private array $queuesData = [];
    private array $spyerChannels = [];
    private array $agentToQueues = []; // agent number => [queueIds]

    // Call pickup tracking
    private array $pickupChannels = [];    // channel => ['target_extension' => ..., 'initial_linkedid' => ..., 'pickup_time' => ...]
    private array $channelLinkedIds = [];  // channel => current_linkedid (для отслеживания изменений)

    // Throttling WebSocket updates
    private int $stateUpdateScheduled = 0;      // timestamp первого изменения (ms)
    private float $lastStateUpdateSent = 0.0;   // timestamp последней отправки (ms)
    private $pendingUserStatesData = null;      // накопленные изменения

    public const ENDPOINT_TYPE_PEER = '1';
    public const ENDPOINT_TYPE_PROVIDER = '2';
    public const STATE_IDLE         = 'Idle';
    public const STATE_RINGING      = 'Ringing';
    public const STATE_ONHOLD       = 'OnHold';
    public const STATE_RING         = 'Ring';
    public const CALL_EVENTS = [
        'UserEvent',
        'ExtensionStatus',
        'NewCallerid',
        'NewConnectedLine',
        'BridgeEnter',
        'BridgeLeave',
        'ChanSpyStart',
        'ChanSpyStop',
        'Hangup',
        'Newstate',
        'Newchannel',
    ];

    public const QUEUE_AGENT_STATES = [
        '0' => self::STATE_UNAVAILABLE, // AST_DEVICE_UNKNOWN
        '1' => self::STATE_IDLE, //AST_DEVICE_NOT_INUSE
        '2' => self::STATE_BUSY, //AST_DEVICE_INUSE
        '3' => self::STATE_BUSY, // AST_DEVICE_UNAVAILABLE
        '4' => self::STATE_UNAVAILABLE, // AST_DEVICE_INVALID
        '6' => self::STATE_RINGING, // AST_DEVICE_RINGING
        '7' => self::STATE_ONHOLD, // AST_DEVICE_ONHOLD
    ];
    public const STATE_UP           = 'Up';
    public const STATE_BUSY         = 'Busy';

    public const STATE_UNAVAILABLE  = 'Unavailable';
    public const CALL_TYPE_INNER = 'inner';
    public const CALL_TYPE_OUT = 'outgoing';

    public const CALL_TYPE_IN = 'incoming';

    public const QUEUE_EVENTS = [
        'QueueCallerJoin',
        'QueueMemberStatus',
        'QueueCallerLeave'
    ];

    private const CACHE_TTL = 80000;
    private const CONTROL_INTERVAL = 60;
    private const MAX_BRIDGE_ITERATIONS = 200;
    private const AMI_REQUEST_TIMEOUT = 200000;
    private const STATE_UPDATE_DELAY = 200; // ms - задержка debounce для WebSocket обновлений

    public const STATE_FILE = '/tmp/MonitorActiveCalls_worker.state';

    private array $queueEntryes = [];

    /**
     * Replies to a ping request from the worker
     *
     * @param array $parameters Request parameters
     * @return bool True if ping request was processed
     */
    public function replyOnPingRequest(array $parameters): bool
    {
        try {
            $pingTube = $this->makePingTubeName(static::class);
            if ($pingTube === $parameters['UserEvent']) {
                $this->amCustom->UserEvent("{$pingTube}Pong", []);
                return true;
            }
        } catch (Throwable $e) {
            SystemMessages::sysLogMsg(
                static::class,
                "Ping reply failed: " . $e->getMessage(),
                LOG_WARNING
            );
        }


        return false;
    }

    /**
     * Обновляет state-файл с текущим статусом воркера.
     * Используется safe.php для контроля здоровья процесса.
     *
     * @param string $status 'starting' или 'running'
     */
    public static function updateStateFile(string $status = 'running'): void
    {
        file_put_contents(self::STATE_FILE, json_encode([
            'pid' => getmypid(),
            'ts' => time(),
            'status' => $status,
        ]));
    }

    /**
     * Дополнительный контроль активных вызовов.
     * @return void
     */
    private function channelAdditionalControl()
    {
        if(empty($this->activeChannels)){
            return;
        }
        $this->logger->writeInfo('Start channelAdditionalControl...');
        try{
            $channelsData = WorkerAmiActions::invokeApi('getChannels', []);
            if (!is_array($channelsData) || empty($channelsData)) {
                // Пустой массив может быть признаком некорректной работы $channelsData
                // Не обрабатывает такой вариант.
                return;
            }

            // Cleanup by linkedid and also prune stale channels inside existing linkedid.
            foreach (array_keys($this->activeChannels) as $linkedId) {
                if (!isset($channelsData[$linkedId]) || !is_array($channelsData[$linkedId])) {
                    unset(
                        $this->activeChannels[$linkedId],
                        $this->callType[$linkedId],
                        $this->activeBridges[$linkedId],
                        $this->spyerChannels[$linkedId]
                    );
                    continue;
                }

                $actualChannels = array_flip($channelsData[$linkedId]);
                foreach (array_keys($this->activeChannels[$linkedId]) as $channel) {
                    if (!isset($actualChannels[$channel])) {
                        unset($this->activeChannels[$linkedId][$channel]);
                        if(strpos($channel, '/') !== false) {
                            $endpoint = self::getEndpointName($channel);
                            unset($this->states[$endpoint]['channels'][$channel]);
                        }
                    }
                }

                if (empty($this->activeChannels[$linkedId])) {
                    unset(
                        $this->activeChannels[$linkedId],
                        $this->callType[$linkedId],
                        $this->activeBridges[$linkedId],
                        $this->spyerChannels[$linkedId]
                    );
                }
            }

            // Cleanup queueEntryes for linkedIds that no longer exist
            foreach ($this->queueEntryes as $queueId => $queueChannels) {
                foreach ($queueChannels as $channel => $data) {
                    $queueLinkedId = $data['Linkedid'] ?? '';
                    if (!empty($queueLinkedId) && !isset($channelsData[$queueLinkedId])) {
                        unset($this->queueEntryes[$queueId][$channel]);
                    }
                }
                if (empty($this->queueEntryes[$queueId])) {
                    unset($this->queueEntryes[$queueId]);
                }
            }

            // Cleanup orphaned spyerChannels
            foreach (array_keys($this->spyerChannels) as $spyLinkedId) {
                if (!isset($channelsData[$spyLinkedId])) {
                    unset($this->spyerChannels[$spyLinkedId]);
                }
            }

            // Cleanup orphaned activeBridges
            foreach (array_keys($this->activeBridges) as $bridgeLinkedId) {
                if (!isset($channelsData[$bridgeLinkedId])) {
                    unset($this->activeBridges[$bridgeLinkedId]);
                }
            }

            // Cleanup old pickup mappings (старше 2 минут)
            foreach ($this->pickupChannels as $channel => $data) {
                if (time() - ($data['pickup_time'] ?? 0) > 120) {
                    unset($this->pickupChannels[$channel]);
                    unset($this->channelLinkedIds[$channel]);
                }
            }

            // Cleanup orphaned channelLinkedIds
            foreach (array_keys($this->channelLinkedIds) as $channel) {
                $found = false;
                foreach ($this->activeChannels as $channels) {
                    if (isset($channels[$channel])) {
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    unset($this->channelLinkedIds[$channel]);
                }
            }
        }catch (\Throwable $e){
            SystemMessages::sysLogMsg( static::class, "Channel control: " . $e->getMessage(), LOG_WARNING);
        }
    }

    /**
     * Старт работы листнера.
     *
     * @param $argv
     */
    public function start($argv):void
    {
        $this->logger = new Logger('ActiveCalls', 'ModuleMonitorActiveCalls');
        $this->logger->writeInfo('Starting...');
        self::updateStateFile('starting');

        $this->backendExists = MonitorActiveCallsMain::backendExists();
        $this->initManagerAsterisk();
        $this->getExtensionsInfo();
        $this->updateStates();

        $this->collectActiveChannels();
        $this->collectActiveBridges();
        $this->collectQueuesInfo();

        $this->init = false;
        $this->printActiveCalls();
        self::updateStateFile('running');
        $this->logger->writeInfo('Wait events...');
        $this->amCustom->setOnIdleCallback(function () {
            self::updateStateFile('running');
            $this->flushPendingStateUpdate(); // Отправляем накопленные WS обновления, если есть
        }, 1); // Проверка каждую секунду для быстрой отправки WS updates
        while ($this->needRestart === false) {
            try {
                $this->amCustom->waitUserEvent(true);
                if (!$this->amCustom->loggedIn()) {
                    sleep(1);
                    $this->logger->writeInfo('initManagerAsterisk...');
                    $this->initManagerAsterisk();
                    $this->amCustom->setOnIdleCallback(function () {
                        self::updateStateFile('running');
                        $this->flushPendingStateUpdate(); // Отправляем накопленные WS обновления, если есть
                    }, 1); // Проверка каждую секунду для быстрой отправки WS updates
                }
            } catch (\Throwable $e) {
                $this->logger->writeError("Error in main loop: " . $e->getMessage());
                sleep(2);
                $this->initManagerAsterisk();
            }
        }
    }

    /**
     * Сбор информации об активных соединениях.
     * @return void
     */
    private function collectActiveBridges():void
    {
        $bridgeUidData = $this->amCustom->sendRequest('BridgeList', ['ActionID' => time()])['data']['BridgeListItem']??[];
        foreach ($bridgeUidData as $bridgeUid) {
            $bridgeData = $this->amCustom->sendRequest('BridgeInfo', ['ActionID' => time(),'BridgeUniqueid' => $bridgeUid['BridgeUniqueid']]);
            $bridgeDataChannels = $bridgeData['data']['BridgeInfoChannel']??'';
            if(!is_array($bridgeDataChannels)){
                continue;
            }
            foreach ($bridgeDataChannels as &$parameters) {
                $parameters['Event'] = 'BridgeEnter';
                $parameters['BridgeUniqueid'] = $bridgeUid['BridgeUniqueid'];
                $parameters['Timestamp'] = time();
                $this->callEvents($parameters);
            }
        }
    }

    private function printActiveCalls():void
    {
        if($this->init){
            return;
        }
        if(time() - $this->lastControlActiveCalls > self::CONTROL_INTERVAL){
            $this->lastControlActiveCalls = time();
            $this->channelAdditionalControl();
        }

        $queuesData = $this->queuesData;
        foreach ($queuesData as $qId => $queueTmpData){
            $queuesData[$qId]['agents'] = [];
            foreach ($this->queuesData[$qId]['agents'] as $number){
                if(isset($this->states[$number])){
                    // Внутренний номер телефона
                    $queuesData[$qId]['agents'][$number] = [
                        'state' => $this->states[$number]["state"],
                        'name' => $this->states[$number]['name']
                    ];
                }elseif(isset($this->mobileStates[$number])){
                    // Мобильный номер телефона
                    $queuesData[$qId]['agents'][$number] = [
                        'state' => $this->mobileStates[$number]["state"],
                        'name' => $this->mobileStates[$number]['name']
                    ];
                }
            }
        }

        $calls = [];
        $queueCalls = [];
        foreach ($this->queueEntryes as $queueId => $queueChannels) {
            foreach ($queueChannels as $queueChannelData) {
                $queueCalls[$queueChannelData['Linkedid']] = [
                    'QueueID' => $queueId,
                    'EnterTime' => $queueChannelData['EnterTime'],
                ];
            }

        }

        foreach ($this->activeChannels as $linkedid => $callData) {
            // is_app,UNIQUEID AS uid
            $srcChan = $this->callType[$linkedid]['src_chan']??'';
            $call = [
                'start'    => $this->callType[$linkedid]['time']??'',
                'answer'   => $this->callType[$linkedid]['answer']??'',
                'typeCall' => $this->callType[$linkedid]['type']??'',
                'src_chan' => $srcChan,
                'src_num'  => $callData[$srcChan]['CallerIDNum']??'',
                'exten'    => ($callData[$srcChan]['InApp']??false)?$callData[$srcChan]['Exten']??'':'',
                'dst_chan' => '',
                'dst_num'  => '',
                'did'      => $this->callType[$linkedid]['did']??'',
                'linkedid' => $linkedid,
                'calledChannels' => [],
                'bridgeChannels' => [],
                'spyer'     => false,
                'spy_num'   => '',
                'spy_chan'  => '',
                'queueData' => $this->getQueueData($queueCalls, $linkedid),
                'lastQueue' => $this->callType[$linkedid]['queue']??''
            ];
            $dstChannel = $srcChan;
            $bridgeStart = time();
            $chFound = $this->findBridgeChannel($linkedid,$dstChannel, $bridgeStart);

            if($chFound){
                // Активный разговор
                $call['dst_chan'] = $dstChannel;
                $call['dst_num']  = $callData[$dstChannel]['CallerIDNum'];

                // Обновляем статус агента очереди
                $this->updateAgentState($queuesData, $call['dst_num'], self::STATE_UP);
                $this->updateAgentState($queuesData, $call['src_num'], self::STATE_UP);
            }else{
                $bridgeChannels = [];
                // Поиск вызываемых каналов.
                foreach ($callData as $channel => $channelData){
                    if($channel === $srcChan){
                        continue;
                    }
                    $tmpDstChannel  = $channel;
                    $tmpBridgeStart = time();
                    $tmpChFound = $this->findBridgeChannel($linkedid,$tmpDstChannel, $tmpBridgeStart);
                    if(!$tmpChFound){
                        // Идет дозвон.
                        $call['calledChannels'][] = [
                            'channel' => $channel,
                            'number'  => $channelData['CallerIDNum'],
                        ];
                    }elseif(!isset($bridgeChannels[$channel])){
                        // Вероятная переадресация с консультацией. Начальный канал в ожидании.
                        $bridgeChannels[$channel] = true;
                        $bridgeChannels[$tmpDstChannel] = true;

                        $tmpSrcNum = $channelData['CallerIDNum'];
                        $tmpDstNum = $callData[$tmpDstChannel]['CallerIDNum'];
                        $call['bridgeChannels'][] = [
                            'answer' => $tmpBridgeStart,
                            'src_chan' => $channel,
                            'src_num'  => $tmpSrcNum,
                            'dst_chan' => $tmpDstChannel,
                            'dst_num'  => $tmpDstNum
                        ];
                        // Обновляем статус агента очереди
                        $this->updateAgentState($queuesData, $tmpSrcNum, self::STATE_UP);
                        $this->updateAgentState($queuesData, $tmpDstNum, self::STATE_UP);
                    }

                }
            }

            if(isset($this->spyerChannels[$linkedid])){
                $call['spyer'] = $this->spyerChannels[$linkedid]['spyer']??false;
                if($call['spyer']){
                    $call['spy_num']  = $this->spyerChannels[$linkedid]['dst_num']??'';
                    $call['spy_chan'] = $this->spyerChannels[$linkedid]['dst_chan']??'';
                }else{
                    $call['spy_num']  = $this->spyerChannels[$linkedid]['src_num']??'';
                    $call['spy_chan'] = $this->spyerChannels[$linkedid]['src_chan']??'';
                }
            }
            if(empty($call['lastQueue'])){
                $calls[] = $call;
            }else{
                $queuesData[$call['lastQueue']]['calls'][] = $call;
            }
        }

        // Move Unavailable agents to the end of the list (keep original order for the rest).
        foreach ($queuesData as $qId => $queueTmpData) {
            if (empty($queuesData[$qId]['agents']) || !is_array($queuesData[$qId]['agents'])) {
                continue;
            }
            $availableAgents = [];
            $unavailableAgents = [];
            foreach ($queuesData[$qId]['agents'] as $agentNumber => $agentData) {
                $state = $agentData['state'] ?? '';
                if ($state === self::STATE_UNAVAILABLE) {
                    $unavailableAgents[$agentNumber] = $agentData;
                } else {
                    $availableAgents[$agentNumber] = $agentData;
                }
            }
            $queuesData[$qId]['agents'] = $availableAgents + $unavailableAgents;
        }

        $callData = ['queues' => $queuesData, 'calls' => $calls];
        $dataPrint = json_encode($callData, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
        $newPrintHash = md5($dataPrint);
        if($newPrintHash <> $this->lastPrintHash){
            $this->lastPrintHash = $newPrintHash;
            CacheManager::setCacheData('getActiveChannelsV2Action', $callData, self::CACHE_TTL);
            if($this->backendExists) {
                BackendApiController::publishActiveCalls($callData);
            }
        }
        unset($callData);

        $enrichedStates = $this->enrichStatesWithConnections();
        $data = ['states' => $enrichedStates];
        $dataPrint = json_encode($data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
        $newPrintHash = md5($dataPrint);

        $now = (int)(microtime(true) * 1000); // текущее время в миллисекундах

        // Если состояние изменилось
        if($newPrintHash <> $this->lastPrintUserHash){
            $this->lastPrintUserHash = $newPrintHash;
            $this->pendingUserStatesData = $data;

            // Планируем отправку, если ещё не запланирована
            if($this->stateUpdateScheduled === 0) {
                $this->stateUpdateScheduled = $now;
                $this->logger->writeInfo("WS throttle: State change detected, scheduled update");
            } else {
                $timeSinceScheduled = $now - $this->stateUpdateScheduled;
                $this->logger->writeInfo("WS throttle: State changed again, pending send in {$timeSinceScheduled}ms");
            }
        }

        // Проверяем, пора ли отправлять накопленные изменения
        $this->flushPendingStateUpdate();

    }

    /**
     * Отправляет накопленные обновления getUsersStates, если прошло достаточно времени.
     * Может вызываться из scheduleUserStatesUpdate() и из idle callback.
     */
    private function flushPendingStateUpdate(): void
    {
        if ($this->stateUpdateScheduled === 0) {
            return; // Нет запланированных обновлений
        }

        $now = (int)(microtime(true) * 1000);
        $elapsed = $now - $this->stateUpdateScheduled;

        if ($elapsed < self::STATE_UPDATE_DELAY) {
            return; // Ещё рано отправлять
        }

        // Пора отправлять
        if ($this->pendingUserStatesData !== null) {
            $timeSinceLastSent = $this->lastStateUpdateSent > 0 ? $now - $this->lastStateUpdateSent : 0;
            $payloadSize = strlen(json_encode($this->pendingUserStatesData, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE));

            $this->logger->writeInfo("WS throttle: Sending update after {$elapsed}ms delay, " .
                "payload: {$payloadSize} bytes, " .
                "time since last: {$timeSinceLastSent}ms");

            CacheManager::setCacheData('getUsersStates', $this->pendingUserStatesData, self::CACHE_TTL);
            if ($this->backendExists) {
                BackendApiController::publishUserStates($this->pendingUserStatesData);
            }
            $this->lastStateUpdateSent = $now;
            $this->pendingUserStatesData = null;
        }
        $this->stateUpdateScheduled = 0;
    }

    /**
     * Обогащает states информацией о соединённых каналах.
     * Создаёт копию $this->states, не модифицируя оригинал.
     *
     * @return array Enriched states with connection info
     */
    private function enrichStatesWithConnections(): array
    {
        $states = $this->states;

        // Обновляем состояние очередей на основе состояния агентов
        foreach ($this->queuesData as $queueId => $queueData) {
            $queueNumber = $queueData['number'] ?? '';
            if (empty($queueNumber) || !isset($states[$queueNumber])) {
                continue;
            }

            $hasIdleAgent = false;
            $hasAvailableAgent = false;

            foreach ($queueData['agents'] as $agentNumber) {
                $agentState = '';
                if (isset($this->states[$agentNumber])) {
                    $agentState = $this->states[$agentNumber]['state'];
                } elseif (isset($this->mobileStates[$agentNumber])) {
                    $agentState = $this->mobileStates[$agentNumber]['state'];
                }

                if ($agentState === self::STATE_IDLE) {
                    $hasIdleAgent = true;
                    $hasAvailableAgent = true;
                    break;
                } elseif ($agentState !== self::STATE_UNAVAILABLE) {
                    $hasAvailableAgent = true;
                }
            }

            if ($hasIdleAgent) {
                $states[$queueNumber]['state'] = self::STATE_IDLE;
            } elseif ($hasAvailableAgent) {
                $states[$queueNumber]['state'] = self::STATE_BUSY;
            } else {
                $states[$queueNumber]['state'] = self::STATE_UNAVAILABLE;
            }
        }

        // Строим карту channel -> linkedId
        $channelToLinkedId = [];
        foreach ($this->activeChannels as $linkedId => $channels) {
            foreach (array_keys($channels) as $channel) {
                $channelToLinkedId[$channel] = $linkedId;
            }
        }

        // Обновляем channels в копии states
        foreach ($states as $endpoint => &$stateData) {
            if (empty($stateData['channels'])) {
                unset($stateData['channels']); // Удаляем пустой ключ для экономии трафика
                continue;
            }
            $enrichedChannels = [];
            foreach (array_keys($stateData['channels']) as $channel) {
                $linkedId = $channelToLinkedId[$channel] ?? '';
                if (empty($linkedId)) {
                    $enrichedChannels[$channel] = ['channel' => '', 'number' => '', 'direction' => ''];
                    continue;
                }

                // Определяем направление звонка относительно владельца канала
                $srcChan = $this->callType[$linkedId]['src_chan'] ?? '';
                $direction = ($channel === $srcChan) ? 'outgoing' : 'incoming';

                // Проходим цепочку бриджей через Local-каналы до реального PJSIP-канала
                $resolvedChannel = $channel;
                $bridgeStart = time();
                $found = $this->findBridgeChannel($linkedId, $resolvedChannel, $bridgeStart);

                if ($found && $resolvedChannel !== $channel) {
                    $number = $this->activeChannels[$linkedId][$resolvedChannel]['CallerIDNum'] ?? '';
                    $enrichedChannels[$channel] = ['channel' => $resolvedChannel, 'number' => $number, 'direction' => $direction];
                } else {
                    // Канал не в бридже (звонит/ожидает) — используем ConnectedLineNum
                    $connectedNum = $this->activeChannels[$linkedId][$channel]['ConnectedLineNum'] ?? '';
                    if (!empty($connectedNum) && strpos($connectedNum, '<') === false) {
                        $enrichedChannels[$channel] = ['channel' => '', 'number' => $connectedNum, 'direction' => $direction];
                    } else {
                        $enrichedChannels[$channel] = ['channel' => '', 'number' => '', 'direction' => $direction];
                    }
                }
            }
            // Добавляем channels только если есть данные
            if (!empty($enrichedChannels)) {
                $stateData['channels'] = $enrichedChannels;
            } else {
                unset($stateData['channels']); // Удаляем если обогащение не дало результата
            }
        }
        unset($stateData);

        return $states;
    }

    /**
     * Получение данных о времени входа в очередь.
     * Использует queueCalls если доступно, иначе берёт из callType.
     * @param array $queueCalls
     * @param string $linkedid
     * @return array
     */
    private function getQueueData(array $queueCalls, string $linkedid): array
    {
        if (!empty($queueCalls[$linkedid])) {
            return $queueCalls[$linkedid];
        }
        // Fallback: использовать сохранённые данные из callType
        $queueId = $this->callType[$linkedid]['queue'] ?? '';
        $enterTime = $this->callType[$linkedid]['queueEnterTime'] ?? 0;
        if (!empty($queueId) && $enterTime > 0) {
            return [
                'QueueID' => $queueId,
                'EnterTime' => $enterTime,
            ];
        }
        return [];
    }

    /**
     * Миграция канала из одного linkedId в другой при изменении linkedid (например, при call pickup).
     *
     * @param string $channel Имя канала
     * @param string $oldLinkedId Старый linkedid
     * @param string $newLinkedId Новый linkedid
     * @return void
     */
    private function migrateChannel(string $channel, string $oldLinkedId, string $newLinkedId): void
    {
        // 1. Переместить данные канала из activeChannels
        if (isset($this->activeChannels[$oldLinkedId][$channel])) {
            $channelData = $this->activeChannels[$oldLinkedId][$channel];
            $this->activeChannels[$newLinkedId][$channel] = $channelData;
            unset($this->activeChannels[$oldLinkedId][$channel]);

            $this->logger->writeInfo("Migrated channel $channel: $oldLinkedId -> $newLinkedId");
        }

        // 2. Очистить старый linkedId если он опустел
        if (isset($this->activeChannels[$oldLinkedId]) && empty($this->activeChannels[$oldLinkedId])) {
            unset($this->activeChannels[$oldLinkedId]);
            $this->logger->writeInfo("Removed empty linkedId $oldLinkedId after migration");
        }

        // 3. Обновить activeBridges если канал был в bridge
        foreach ($this->activeBridges[$oldLinkedId] ?? [] as $bridgeId => $channels) {
            if (isset($channels[$channel])) {
                $this->activeBridges[$newLinkedId][$bridgeId][$channel] = $channels[$channel];
                unset($this->activeBridges[$oldLinkedId][$bridgeId][$channel]);
            }
        }
    }

    /**
     * Поиск связанного канала.
     * @param $linkedId
     * @param $dstChannel
     * @param $tmpBridgeStart
     * @return bool
     */
    private function findBridgeChannel($linkedId, &$dstChannel, &$tmpBridgeStart):bool
    {
        $srcChan = $dstChannel;
        $chFound = true;

        $ch = self::MAX_BRIDGE_ITERATIONS;
        // Поиск связанного канала.
        while ( ($dstChannel === $srcChan || stripos($dstChannel, 'Local/') !== false) && $chFound ) {
            $ch--;
            if($ch < 0){
                break;
            }
            $chFound = false;
            if(!isset($this->activeBridges[$linkedId])){
                break;
            }
            foreach ($this->activeBridges[$linkedId] as $bridge) {
                if(count($bridge) === 1){
                    continue;
                }
                if($dstChannel === array_key_first($bridge)){
                    $dstChannel = $this->swapLocalSuffix(array_key_last($bridge));
                    $tmpBridgeStart = $bridge[$dstChannel]??$tmpBridgeStart;
                    $chFound = true;
                    break;
                }elseif ($dstChannel === array_key_last($bridge)){
                    $dstChannel = $this->swapLocalSuffix(array_key_first($bridge));
                    $tmpBridgeStart = $bridge[$dstChannel]??$tmpBridgeStart;
                    $chFound = true;
                    break;
                }
            }
        }

        return $chFound;
    }

    private function swapLocalSuffix($str):string {
        return preg_replace_callback(
            '/;(1|2)$/',
            function ($matches) {
                return ';' . ($matches[1] === '1' ? '2' : '1');
            },
            $str
        );
    }

    /**
     * Builds agent to queues index for O(1) lookup.
     */
    private function buildAgentIndex(): void
    {
        $this->agentToQueues = [];
        foreach ($this->queuesData as $qId => $data) {
            foreach ($data['agents'] as $agent) {
                $this->agentToQueues[$agent][] = $qId;
            }
        }
    }

    /**
     * Updates agent state in all queues where agent is a member.
     *
     * @param array $queuesData Reference to queues data array
     * @param string $number Agent number
     * @param string $state New state value
     */
    private function updateAgentState(array &$queuesData, string $number, string $state): void
    {
        foreach ($this->agentToQueues[$number] ?? [] as $qId) {
            if (isset($queuesData[$qId]['agents'][$number])) {
                $queuesData[$qId]['agents'][$number]['state'] = $state;
            }
        }
    }

    private function collectQueuesInfo():void
    {
        $this->logger->writeInfo('Update queues data...');
        $this->queuesData = [];
        $queues = CallQueues::find(['columns' => 'name,extension as number,uniqid as id']);
        foreach ($queues as $queue){
            $this->queuesData[$queue->id] = $queue->toArray();
            $this->queuesData[$queue->id]['agents'] = [];

            // Добавляем очередь в states
            $this->states[$queue->number] = [
                'state' => self::STATE_UNAVAILABLE,
                'name' => $queue->name,
                'channels' => [],
                'isQueue' => true
            ];
        }
        $queuesAgents = CallQueueMembers::find(['columns' => 'queue,extension']);
        foreach ($queuesAgents as $queuesAgent) {
            $this->queuesData[$queuesAgent->queue]['agents'][] = $queuesAgent->extension;
        }
        $this->buildAgentIndex();
        if(!$this->init){
            return;
        }
        $this->logger->writeInfo('Collect queue calls...');
        $queueInfo = $this->amCustom->QueueStatus('WorkerActiveCalls');
        $queueMember = $queueInfo['data']['QueueMember']??[];
        foreach ($queueMember as $member){
            if(isset($this->mobileStates[$member['Name']])){
                $this->mobileStates[$member['Name']]['state'] = self::QUEUE_AGENT_STATES[$member['Status']]??self::STATE_UNAVAILABLE;
            }
        }

        $queueCalls = $queueInfo['data']['QueueEntry']??[];
        foreach ($queueCalls as $queueCall) {
            $linkedId = $this->amCustom->GetVar($queueCall['Channel'], 'CHANNEL(linkedid)', '', false);
            $this->queueEntryes[$queueCall['Queue']][$queueCall['Channel']] = [
                'EnterTime'     => time() - intval($queueCall['Wait']),
                'Uniqueid'      => $queueCall['Uniqueid'],
                'Linkedid'      => $linkedId
            ];
            $this->callType[$linkedId]['queue'] = $queueCall['Queue'];
        }
    }

    /**
     * Собирает информацию об активных каналах.
     * @return void
     */
    private function collectActiveChannels():void
    {
        $channelsData = $this->amCustom->GetChannels();
        foreach ($channelsData as $linkedId => $channels) {
            foreach ($channels as $channel) {
                if(stripos($channel, 'local') !== false) {
                    continue;
                }
                // Пропускаем каналы без слеша (например, OutgoingSpoolFailed)
                if(strpos($channel, '/') === false) {
                    continue;
                }
                $endpoint   = self::getEndpointName($channel);
                $context    = $this->amCustom->GetVar($channel, 'CONTEXT', '', false);
                if(strpos($context, 'ivr-') === 0){
                    $extension = str_replace('ivr-', '', $context);
                    $inApp = true;
                }else{
                    $extension = $this->amCustom->GetVar($channel, 'EXTEN', '', false);
                    $inApp = $context === 'applications';
                }

                $chanData = [
                    'ChannelStateDesc'  => $this->amCustom->GetVar($channel, 'CHANNEL(state)', '', false),
                    'CallerIDNum'       => $this->amCustom->GetVar($channel, 'CALLERID(num)','', false),
                    'ConnectedLineNum'  => $this->amCustom->GetVar($channel, 'CONNECTEDLINE(num)','', false),
                    'Uniqueid'          => $this->amCustom->GetVar($channel, 'CHANNEL(uniqueid)','', false),
                    'Endpoint'          => $endpoint,
                    'Type'              => (stripos($endpoint, 'SIP-') !== false)?self::ENDPOINT_TYPE_PROVIDER:self::ENDPOINT_TYPE_PEER,
                    'Exten'             => $extension,
                    'InApp'             => $inApp,
                ];

                $did = $this->amCustom->GetVar($channel, 'FROM_DID','', false);
                if(!isset($this->callType[$linkedId])){
                    if($chanData['Type'] === self::ENDPOINT_TYPE_PROVIDER){
                        $callType = self::CALL_TYPE_IN;
                    }elseif ($chanData['Type'] === self::ENDPOINT_TYPE_PEER && !empty($did)){
                        $callType = '';
                    }elseif ($chanData['Type'] === self::ENDPOINT_TYPE_PEER && empty($did)){
                        $callType = self::CALL_TYPE_OUT;
                    }else{
                        $callType = self::CALL_TYPE_INNER;
                    }
                    if(!empty($callType)){
                        $this->callType[$linkedId] = [
                            'type'     => $callType,
                            'src_chan' => $channel,
                            'did'      => $did,
                            'time'     => str_replace('mikopbx-','',$chanData['Uniqueid']),
                            'answer'   => strtotime($this->amCustom->GetVar($channel, 'CDR(answer)','', false))
                        ];
                    }
                } elseif ($chanData['Uniqueid'] === $linkedId) {
                    // Этот канал — инициатор звонка (Uniqueid == Linkedid).
                    // Переопределяем src_chan, т.к. порядок обхода каналов не гарантирован.
                    if($chanData['Type'] === self::ENDPOINT_TYPE_PROVIDER){
                        $callType = self::CALL_TYPE_IN;
                    }elseif ($chanData['Type'] === self::ENDPOINT_TYPE_PEER && !empty($did)){
                        $callType = '';
                    }elseif ($chanData['Type'] === self::ENDPOINT_TYPE_PEER && empty($did)){
                        $callType = self::CALL_TYPE_OUT;
                    }else{
                        $callType = self::CALL_TYPE_INNER;
                    }
                    if(!empty($callType)){
                        $this->callType[$linkedId] = [
                            'type'     => $callType,
                            'src_chan' => $channel,
                            'did'      => $did,
                            'time'     => str_replace('mikopbx-','',$chanData['Uniqueid']),
                            'answer'   => strtotime($this->amCustom->GetVar($channel, 'CDR(answer)','', false))
                        ];
                    }
                }
                if($chanData['Type'] === self::ENDPOINT_TYPE_PEER){
                    $this->states[$endpoint]['channels'][$channel] = true;
                    if($this->states[$endpoint]['state'] <> self::STATE_UP){
                        $this->states[$endpoint]['state'] = $chanData['ChannelStateDesc'];
                    }
                }
                $this->activeChannels[$linkedId][$channel] = $chanData;
            }
        }
    }

    /**
     * Начальное получение статусов.
     * @return void
     */
    private function updateStates():void
    {
        $peers = $this->getPjSipPeers();
        foreach ($peers as $peer) {
            if(!isset($this->states[$peer['id']])){
                continue;
            }
            $this->states[$peer['id']]['state'] = $peer['state'];
        }
        $this->updateCacheState();
    }

    /**
     * Функция обновляет кэш статусов сотрудников и очередей.
     * @return void
     */
    private function updateCacheState():void
    {
        // AutoDialerMain::setCacheData('statuses', $this->states);
    }

    /**
     * Get the PJSIP peers information.
     *
     * @return array The PJSIP peers information.
     */
    public function getPjSipPeers(): array
    {
        $peers  = [];
        $result = $this->amCustom->sendRequestTimeout('PJSIPShowEndpoints', [], self::AMI_REQUEST_TIMEOUT);
        $state_array = [
            'Not in use' => self::STATE_IDLE,
            'Busy'       => self::STATE_UP,
            'Unavailable'=> self::STATE_UNAVAILABLE,
            'Ringing'    => self::STATE_RINGING
        ];
        $endpoints = $result['data']['EndpointList']??[];
        foreach ($endpoints as $index => $peer) {
            if ($peer['ObjectName'] === 'anonymous') {
                unset($endpoints[$index]);
                continue;
            }elseif (!is_numeric($peer['ObjectName'])){
                continue;
            }
            $peers[$peer['ObjectName']] = [
                'id'        => $peer['ObjectName'],
                'state'     => $state_array[$peer['DeviceState']] ?? $peer['DeviceState']
            ];
            unset($endpoints[$index]);
        }

        foreach ($endpoints as $peer) {
            $dataObjectName = explode('-',$peer['ObjectName']);
            $id     = $dataObjectName[0]??'';
            $prefix = $dataObjectName[1]??'';
            if(  is_numeric($id) && $prefix === 'WS' ){
                $wsState = $state_array[$peer['DeviceState']];
                if($wsState === self::STATE_IDLE){
                    $peers[$id]['state'] = $state_array[$peer['DeviceState']];
                }
            }
        }
        return array_values($peers);
    }

    /**
     * Получает настройки АТС.
     * @return void
     */
    private function getExtensionsInfo():void{
        $extensions = $this->getExtensions();
        foreach ($extensions as $extension){
            if($extension->type === Extensions::TYPE_SIP){
                if(isset($this->states[$extension->number])){
                    continue;
                }
                // Первичныя инициализация.
                $this->states[$extension->number] = [
                    'state' => self::STATE_IDLE,
                    'name' => $extension->callerid,
                    'channels' => []
                ];
            }else{
                $this->mobileStates[$extension->number] = [
                    'state' => self::STATE_IDLE,
                    'name' => $extension->callerid,
                    'channels' => []
                ];
            }
        }
    }

    /**
     * Получение внутренних номеров.
     * @return null
     */
    public function getExtensions()
    {
        $manager = $this->di->get('modelsManager');
        $parameters = [
            'models'     => [
                'ExtensionsSip' => Extensions::class,
            ],
            'conditions' => "type='".Extensions::TYPE_SIP."' OR type='".Extensions::TYPE_EXTERNAL."'",
            'columns'    => [
                'number'     => 'ExtensionsSip.number',
                'callerid'   => 'ExtensionsSip.callerid',
                'type'       => 'ExtensionsSip.type'
            ],
            'order'      => 'number',
        ];
        return $manager->createBuilder($parameters)->getQuery()->execute();
    }

    /**
     * Установка фильтра
     *
     */
    private function initManagerAsterisk():void
    {
        $amiPort  = PbxSettings::getValueByKey('AMIPort');
        $this->amCustom = new CustomAsteriskManager();
        // Оригинальный AsteriskManager работает плохо с BridgeList и BridgeInfo
        $this->amCustom->connect("127.0.0.1:$amiPort", MonitorActiveCallsConf::AMI_USER, MonitorActiveCallsConf::AMI_USER);
        // Устанавливаем короткий timeout для быстрой отработки idle callback и отправки WebSocket updates
        // 300ms оптимально согласуется с STATE_UPDATE_DELAY (200ms)
        $this->amCustom->setSocketTimeout(0, 300000);

        $pingTube = $this->makePingTubeName(self::class);
        $params = ['Operation' => 'Add', 'Filter' => 'UserEvent: '.$pingTube];
        $this->amCustom->sendRequestTimeout('Filter', $params);
        foreach (self::CALL_EVENTS as $event){
            $params = ['Operation' => 'Add', 'Filter' => "Event: $event"];
            $this->amCustom->sendRequestTimeout('Filter', $params);
        }
        foreach (self::QUEUE_EVENTS as $event){
            $params = ['Operation' => 'Add', 'Filter' => "Event: $event"];
            $this->amCustom->sendRequestTimeout('Filter', $params);
        }

        $this->amCustom->addEventHandler("UserEvent",       [$this, "stateEvents"]);
        $this->amCustom->addEventHandler("ExtensionStatus", [$this, "stateEvents"]);
        foreach (self::CALL_EVENTS as $event){
            $this->amCustom->addEventHandler($event, [$this, "callEvents"]);
        }
        foreach (self::QUEUE_EVENTS as $event){
            $this->amCustom->addEventHandler($event, [$this, "queueEvents"]);
        }
    }

    /**
     * Обработка событий звонка.
     * @param $parameters
     * @return void
     */
    public function callEvents($parameters):void
    {
        $event = $parameters['Event'] ?? '';
        if (empty($event)) {
            return;
        }

        if('Hangup' === $event){
            $linkedId = $parameters['Linkedid'] ?? '';
            $channel  = $parameters['Channel'] ?? '';
            if (empty($linkedId) || empty($channel) || strpos($channel, '/') === false) {
                return;
            }
            $endpoint = self::getEndpointName($channel);

            // Очистить маппинги для канала
            unset($this->channelLinkedIds[$channel]);
            unset($this->pickupChannels[$channel]);

            // Попытка удалить канал из указанного linkedId
            $foundLinkedId = $linkedId;
            if (!isset($this->activeChannels[$linkedId][$channel])) {
                // Linkedid мог измениться (attended transfer, masquerade) — ищем канал во всех linkedId
                foreach (array_keys($this->activeChannels) as $altLinkedId) {
                    if (isset($this->activeChannels[$altLinkedId][$channel])) {
                        $foundLinkedId = $altLinkedId;
                        break;
                    }
                }
            }

            // Проверяем, был ли удалённый канал src_chan (параллельный вызов на несколько устройств)
            $wasSrcChan = isset($this->callType[$foundLinkedId]) &&
                          ($this->callType[$foundLinkedId]['src_chan'] ?? '') === $channel;

            unset($this->activeChannels[$foundLinkedId][$channel]);
            unset($this->states[$endpoint]['channels'][$channel]);

            // Если удалённый канал был src_chan, ищем альтернативный канал с тем же endpoint
            if ($wasSrcChan && !empty($this->activeChannels[$foundLinkedId])) {
                foreach ($this->activeChannels[$foundLinkedId] as $altChannel => $altChanData) {
                    if (self::getEndpointName($altChannel) === $endpoint) {
                        // Нашли активный канал с тем же endpoint — обновляем src_chan
                        $this->callType[$foundLinkedId]['src_chan'] = $altChannel;
                        $this->logger->writeInfo("Updated src_chan from $channel to $altChannel for linkedId $foundLinkedId (parallel dial)");
                        break;
                    }
                }
            }

            if(empty($this->activeChannels[$foundLinkedId])){
                unset($this->activeChannels[$foundLinkedId]);
                unset($this->callType[$foundLinkedId]);
            }
        }elseif(in_array($event, ['Newchannel','Newstate']) && stripos($parameters['Channel'] ?? '', 'local') === false){
            $linkedId = $parameters['Linkedid'] ?? '';
            $channel = $parameters['Channel'] ?? '';
            if (empty($linkedId) || empty($channel)) {
                return;
            }
            // Пропускаем каналы без слеша (например, OutgoingSpoolFailed)
            if(strpos($channel, '/') === false) {
                return;
            }
            $endpoint = self::getEndpointName($channel);

            $context = $parameters['Context'] ?? '';
            if(strpos($context, 'ivr-') === 0){
                $extension = str_replace('ivr-', '', $context);
                $inApp = true;
            }else{
                $extension = $parameters['Exten'] ?? '';
                $inApp = $context === 'applications';
            }

            // Определение pickup-канала по extension *8XXX
            if (preg_match('/^\*8(\d+)$/', $extension, $matches)) {
                $this->channelLinkedIds[$channel] = $linkedId;
                $this->pickupChannels[$channel] = [
                    'target_extension' => $matches[1],
                    'initial_linkedid' => $linkedId,
                    'pickup_time' => time()
                ];
                $this->logger->writeInfo("Pickup channel detected: $channel (*8{$matches[1]}), linkedid=$linkedId");
            }

            $chanData = [
                'ChannelStateDesc'  => $parameters['ChannelStateDesc'] ?? '',
                'CallerIDNum'       => $parameters['CallerIDNum'] ?? '',
                'ConnectedLineNum'  => $parameters['ConnectedLineNum'] ?? '',
                'Uniqueid'          => $parameters['Uniqueid'] ?? '',
                'Endpoint'          => $endpoint,
                'Type'              => (stripos($endpoint, 'SIP-') !== false)?self::ENDPOINT_TYPE_PROVIDER:self::ENDPOINT_TYPE_PEER,
                'Exten'             => $extension,
                'InApp'             => $inApp,
            ];

            if($chanData['Type'] === self::ENDPOINT_TYPE_PEER){
                $this->states[$endpoint]['channels'][$channel] = true;
                if($this->states[$endpoint]['state'] <> self::STATE_UP){
                    $this->states[$endpoint]['state'] = $chanData['ChannelStateDesc'];
                }
            }
            if(!isset($this->activeChannels[$linkedId])){
                $did = '';
                if($chanData['Type'] === self::ENDPOINT_TYPE_PROVIDER){
                    $callType = self::CALL_TYPE_IN;
                    $did = $extension;
                }elseif ($chanData['Type'] === self::ENDPOINT_TYPE_PEER && strlen($extension) < 5){
                    $callType = self::CALL_TYPE_INNER;
                }else{
                    $callType = self::CALL_TYPE_OUT;
                }
                $this->callType[$linkedId] = [
                    'type'      => $callType,
                    'src_chan'  => $channel,
                    'did'       => $did,
                    'time'     => str_replace('mikopbx-','',$chanData['Uniqueid'])
                ];
            }

            if(($this->callType[$linkedId]['src_chan'] ?? '') !== $channel && $chanData['ChannelStateDesc'] === self::STATE_UP){
                // Обновляем время ответа на вызов.
                $this->callType[$linkedId]['answer'] = $parameters['Timestamp'] ?? time();
            }
            $this->activeChannels[$linkedId][$channel] = $chanData;
        }elseif ('NewCallerid' === $event){
            $ncChannel = $parameters['Channel'] ?? '';
            $ncLinkedId = $parameters['Linkedid'] ?? '';
            if (!empty($ncChannel) && strpos($ncChannel, 'PJSIP/') === 0 &&
                 isset($this->activeChannels[$ncLinkedId][$ncChannel])) {
                $this->activeChannels[$ncLinkedId][$ncChannel]['CallerIDNum'] = $parameters['CallerIDNum'] ?? '';
            }
        }elseif ('NewConnectedLine' === $event){
            $nclChannel = $parameters['Channel'] ?? '';
            $nclLinkedId = $parameters['Linkedid'] ?? '';
            $connectedNum = $parameters['ConnectedLineNum'] ?? '';
            if (!empty($nclChannel) && !empty($nclLinkedId) &&
                 isset($this->activeChannels[$nclLinkedId][$nclChannel]) &&
                 !empty($connectedNum) && strpos($connectedNum, '<') === false) {
                $this->activeChannels[$nclLinkedId][$nclChannel]['ConnectedLineNum'] = $connectedNum;
            }
        }elseif ('BridgeEnter' === $event){
            $linkedId = $parameters['Linkedid'] ?? '';
            $bridgeUniqueid = $parameters['BridgeUniqueid'] ?? '';
            $beChannel = $parameters['Channel'] ?? '';
            if (!empty($linkedId) && !empty($bridgeUniqueid) && !empty($beChannel)) {
                // Проверить изменение linkedid для pickup-канала
                if (isset($this->pickupChannels[$beChannel])) {
                    $initialLinkedId = $this->pickupChannels[$beChannel]['initial_linkedid'];

                    if ($initialLinkedId !== $linkedId) {
                        // LinkedId изменился при bridge! Мигрировать канал
                        $this->logger->writeInfo("LinkedId changed for pickup channel $beChannel: $initialLinkedId -> $linkedId (BridgeEnter)");
                        $this->migrateChannel($beChannel, $initialLinkedId, $linkedId);
                        $this->channelLinkedIds[$beChannel] = $linkedId;
                    }
                }

                $this->activeBridges[$linkedId][$bridgeUniqueid][$beChannel] = $parameters['Timestamp'] ?? time();
            }
        }elseif ('ChanSpyStart' === $event){
            $spyerChannel = $parameters['SpyerChannel'] ?? '';
            $spyerLinkedId = $parameters['SpyerLinkedid'] ?? '';
            $spyeeLinkedId = $parameters['SpyeeLinkedid'] ?? '';
            if (empty($spyerLinkedId) || empty($spyeeLinkedId)) {
                return;
            }

            if(stripos($spyerChannel, 'local') !== false){
                $linkedId = $spyerLinkedId;
                $tmpBridgeStart = time();
                $tmpDstChannel = $this->swapLocalSuffix($spyerChannel);
                $orgChan = $this->findBridgeChannel($linkedId, $tmpDstChannel, $tmpBridgeStart) ? $tmpDstChannel : '';
            }else{
                $orgChan = $spyerChannel;
            }
            $this->spyerChannels[$spyerLinkedId] = [
                'spyer' => true,
                'src_chan'       => $orgChan,
                'src_num'        => $parameters['SpyerCallerIDNum'] ?? '',
                'dst_chan'       => $parameters['SpyeeChannel'] ?? '',
                'dst_num'        => $parameters['SpyeeCallerIDNum'] ?? '',
            ];
            $this->spyerChannels[$spyeeLinkedId] = [
                'spyer' => false,
                'src_chan'       => $orgChan,
                'src_num'        => $parameters['SpyerCallerIDNum'] ?? '',
                'dst_chan'       => $parameters['SpyeeChannel'] ?? '',
                'dst_num'        => $parameters['SpyeeCallerIDNum'] ?? '',
            ];

        }elseif ('ChanSpyStop' === $event){
            $spyeeLinkedId = $parameters['SpyeeLinkedid'] ?? '';
            $spyerLinkedId = $parameters['SpyerLinkedid'] ?? '';
            unset(
                $this->spyerChannels[$spyeeLinkedId],
                $this->spyerChannels[$spyerLinkedId]
            );
        }elseif ('BridgeLeave' === $event){
            $linkedId = $parameters['Linkedid'] ?? '';
            $bridgeUniqueid = $parameters['BridgeUniqueid'] ?? '';
            $blChannel = $parameters['Channel'] ?? '';
            if (empty($linkedId) || empty($bridgeUniqueid) || empty($blChannel)) {
                return;
            }
            unset($this->activeBridges[$linkedId][$bridgeUniqueid][$blChannel]);
            if(empty($this->activeBridges[$linkedId][$bridgeUniqueid])){
                unset($this->activeBridges[$linkedId][$bridgeUniqueid]);
            }
            if(empty($this->activeBridges[$linkedId])){
                unset($this->activeBridges[$linkedId]);
            }
        }else{
            return;
        }

        $this->logger->writeInfo($parameters,'callEvents...');
        $this->printActiveCalls();
    }

    public static function getEndpointName(string $channel):string
    {
        $firstSlash = strpos($channel, '/');
        $lastDash   = strrpos($channel, '-');
        return str_replace('-WS', '', substr($channel, $firstSlash + 1, $lastDash - $firstSlash - 1));
    }

    /**
     * Обработка событий звонка.
     * @param $parameters
     * @return void
     */
    public function queueEvents($parameters):void
    {
        $event = $parameters['Event'] ?? '';
        if (empty($event)) {
            return;
        }

        if('QueueCallerJoin' === $event){
            $queue = $parameters['Queue'] ?? '';
            $channel = $parameters['Channel'] ?? '';
            $linkedId = $parameters['Linkedid'] ?? '';
            if (empty($queue) || empty($channel)) {
                return;
            }
            $enterTime = time();
            $this->queueEntryes[$queue][$channel] = [
                'EnterTime'     => $enterTime,
                'Uniqueid'      => $parameters['Uniqueid'] ?? '',
                'Linkedid'      => $linkedId
            ];
            if (!empty($linkedId)) {
                $this->callType[$linkedId]['queue'] = $queue;
                $this->callType[$linkedId]['queueEnterTime'] = $enterTime;
            }
        }elseif ('QueueMemberStatus' === $event){
            $memberName = $parameters['MemberName'] ?? '';
            if (!empty($memberName) && isset($this->mobileStates[$memberName])){
                $this->mobileStates[$memberName]['state'] = self::QUEUE_AGENT_STATES[$parameters['Status'] ?? ''] ?? self::STATE_UNAVAILABLE;
            }
        }elseif ('QueueCallerLeave' === $event){
            $queue = $parameters['Queue'] ?? '';
            $channel = $parameters['Channel'] ?? '';
            if (empty($queue) || empty($channel)) {
                return;
            }
            unset($this->queueEntryes[$queue][$channel]);
            if(empty($this->queueEntryes[$queue])){
                unset($this->queueEntryes[$queue]);
            }
        }else{
            return;
        }

        $this->logger->writeInfo($parameters,'queueEvents...');
        $this->printActiveCalls();
    }

    /**
     * Функция обработки оповещений.
     *
     * @param $parameters
     */
    public function stateEvents($parameters):void
    {
        $event = $parameters['Event'] ?? '';
        if (empty($event)) {
            return;
        }

        if ($event === 'UserEvent' && $this->replyOnPingRequest($parameters)){
            $this->logger->writeInfo($parameters,'update settings...');
            $this->getExtensionsInfo();
            $this->collectQueuesInfo();
            $this->backendExists = MonitorActiveCallsMain::backendExists();
            // Force periodic refresh/cleanup. Without this, stale calls may persist
            // forever if we missed a Hangup event for any reason.
            $this->printActiveCalls();
            return;
        }
        if($event === 'ExtensionStatus'){
            $exten = $parameters['Exten'] ?? '';
            if(!empty($exten) && isset($this->states[$exten]) && empty($this->states[$exten]['isQueue'])){
                $this->states[$exten]['state'] = $parameters['StatusText'] ?? '';
                $this->logger->writeInfo($parameters,'stateEvents...');
                $this->printActiveCalls();
                $this->updateCacheState();
            }
        }
    }
}

if(isset($argv) && count($argv) !== 1
    && Util::getFilePathByClassName(WorkerActiveCalls::class) === $argv[0]){
    // Start worker process
    WorkerActiveCalls::startWorker($argv??[]);
}