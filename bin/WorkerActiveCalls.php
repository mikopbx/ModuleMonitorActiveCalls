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
use MikoPBX\Core\Asterisk\AsteriskManager;
use MikoPBX\Core\Workers\WorkerBase;
use MikoPBX\Core\System\Util;
use Modules\ModuleMonitorActiveCalls\Lib\CacheManager;
use Modules\ModuleMonitorActiveCalls\Lib\Logger;
use Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsConf;
use Modules\ModuleSoftphoneBackend\Lib\RestAPI\Controllers\ApiController;

require_once 'Globals.php';

class WorkerActiveCalls extends WorkerBase
{
    public Logger $logger;
    private bool $init = true;
    private string $lastPrintHash = '';
    private string $lastPrintUserHash = '';
    private int $lastPrintCalls = 0;
    private int $lastControlActiveCalls = 0;
    /** @var AsteriskManager $am */
    protected AsteriskManager $am;
    protected CustomAsteriskManager $amCustom;
    private array $activeChannels = [];
    private array $states = [];
    private array $mobileStates = [];
    private array $activeBridges = [];
    private array $callType = [];
    private array $queuesData = [];
    private array $spyerChannels = [];

    public const ENDPOINT_TYPE_PEER = '1';
    public const ENDPOINT_TYPE_PROVIDER = '2';
    public const STATE_IDLE         = 'Idle';
    public const STATE_RINGING      = 'Ringing';
    public const STATE_ONHOLD       = 'OnHold';
    public const STATE_RING         = 'Ring';
    public const STATE_UNAVAILIBLE  = 'Unavailable';
    public const CALL_EVENTS = [
        'UserEvent',
        'ExtensionStatus',
        'NewCallerid',
        'BridgeEnter',
        'BridgeLeave',
        'ChanSpyStart',
        'ChanSpyStop',
        'ExtensionStatus',
        'Hangup',
        'Newstate',
        'Newchannel',
    ];

    public const QUEUE_AGENT_STATES = [
        '0' => self::STATE_UNAVAILIBLE, // AST_DEVICE_UNKNOWN
        '1' => self::STATE_IDLE, //AST_DEVICE_NOT_INUSE
        '2' => self::STATE_BUSY, //AST_DEVICE_INUSE
        '3' => self::STATE_BUSY, // AST_DEVICE_UNAVAILABLE
        '4' => self::STATE_UNAVAILIBLE, // AST_DEVICE_INVALID
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

    private $queueEntryes = [];

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

    private function channelAdditionalControle()
    {
        if(empty($this->activeChannels)){
            return;
        }
        try{
            $channelsData = WorkerAmiActions::invokeApi('getChannels', []);
            if(!empty($channelsData)){
                $ids = array_keys($channelsData);
                $chanIds = array_keys($this->activeChannels);
                foreach ($chanIds as $id){
                    if(!in_array($id, $ids)){
                        unset($this->activeChannels[$id]);
                    }
                }
            }
        }catch (Throwable $e){
            SystemMessages::sysLogMsg(
                static::class,
                "Channel contole: " . $e->getMessage(),
                LOG_WARNING
            );
        }
    }

    /**
     * Старт работы листнера.
     *
     * @param $argv
     */
    public function start($argv):void
    {
        $this->logger = new Logger('ActiveCalls', 'WorkerActiveCalls');
        $this->logger->writeInfo('Starting...');
        $this->initManagerAsterisk();

        $this->getExtensionsInfo();
        $this->updateStates();
        $this->logger->writeInfo('Collect active lines...');

        $this->collectActiveChannels();
        $this->collectActiveBridges();
        $this->collectQueuesInfo();

        $this->init = false;
        $this->printActiveCalls();
        $this->logger->writeInfo('Wait events...');
        while (true) {
            $this->amCustom->waitUserEvent(true);
            if (!$this->amCustom->loggedIn()) {
                sleep(1);
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
        if(time() - $this->lastControlActiveCalls > 60 && !empty($this->activeChannels)){
            $this->lastControlActiveCalls = time();
            $this->channelAdditionalControle();
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
                'queueData' => $queueCalls[$linkedid]??[],
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
                foreach ($queuesData as $qId => $queueTmpData) {
                    if(isset($queuesData[$qId]['agents'][$call['dst_num']])){
                        $queuesData[$qId]['agents'][$call['dst_num']]['state'] = self::STATE_UP;
                    }
                    if(isset($queuesData[$qId]['agents'][$call['src_num']])){
                        $queuesData[$qId]['agents'][$call['src_num']]['state'] = self::STATE_UP;
                    }
                }
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
                        // Идет дозвони.
                        $call['calledChannels'][] = [
                            'channel' => $channel,
                            'number'  => $channelData['CallerIDNum'],
                        ];
                    }elseif(!isset($bridgeChannels[$channel])){
                        // Вероятная переадресация с кнсультацией. Начальный канал в ожидании.
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
                        foreach ($queuesData as $qId => $queueTmpData) {
                            if(isset($queuesData[$qId]['agents'][$tmpSrcNum])){
                                $queuesData[$qId]['agents'][$tmpSrcNum]['state'] = self::STATE_UP;
                            }
                            if(isset($queuesData[$qId]['agents'][$tmpDstNum])){
                                $queuesData[$qId]['agents'][$tmpDstNum]['state'] = self::STATE_UP;
                            }
                        }
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
        $dataPrint = json_encode(['queues' => $queuesData, 'calls' => $calls], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
        $newPrintHash = md5($dataPrint);
        if($newPrintHash <> $this->lastPrintHash){
            $this->lastPrintHash = $newPrintHash;
            CacheManager::setCacheData('getActiveChannelsV2Action', ['queues' => $queuesData, 'calls' => $calls], 80000);
        }
        $data = ['states' => $this->states];
        $dataPrint = json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
        $newPrintHash = md5($dataPrint);
        if($newPrintHash <> $this->lastPrintUserHash){
            $this->lastPrintUserHash = $newPrintHash;
            CacheManager::setCacheData('getUsersStates', $data, 80000);
            if(class_exists('\Modules\ModuleSoftphoneBackend\Lib\RestAPI\Controllers\ApiController')){
                try {
                    ApiController::publishUserStates($data);
                }catch (\Exception $e){
                    unset($e);
                }
            }
        }
        
    }

    /**
     * Поиск связанного канала.
     * @param $linkedId
     * @param $srcChan
     * @return bool
     */
    private function findBridgeChannel($linkedId, &$dstChannel, &$tmpBridgeStart):bool
    {
        $srcChan = $dstChannel;
        $chFound = true;

        $ch = 200;
        // Поиск связанного канала.
        while ( ($dstChannel === $srcChan || stripos($dstChannel, 'Local/') !== false) && $chFound ) {
            $ch--;
            if($ch < 0){
                print_r('ERROR, while');
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

    private function collectQueuesInfo():void
    {
        $this->queuesData = [];
        $queues = CallQueues::find(['columns' => 'name,extension as number,uniqid as id']);
        foreach ($queues as $queue){
            $this->queuesData[$queue->id] = $queue->toArray();
            $this->queuesData[$queue->id]['agents'] = [];
        }
        $queuesAgents = CallQueueMembers::find(['columns' => 'queue,extension']);
        foreach ($queuesAgents as $queuesAgent) {
            $this->queuesData[$queuesAgent->queue]['agents'][] = $queuesAgent->extension;
        }

        if(!$this->init){
            return;
        }
        $this->logger->writeInfo('Collect queue calls...');
        $queueInfo = $this->amCustom->QueueStatus('WorkerActiveCalls');
        $queueMember = $queueInfo['data']['QueueMember']??[];
        foreach ($queueMember as $member){
            if(isset($this->mobileStates[$member['Name']])){
                $this->mobileStates[$member['Name']]['state'] = self::QUEUE_AGENT_STATES[$member['Status']]??self::STATE_UNAVAILIBLE;
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
                $endpoint   = self::getEndpointName($channel);
                $context    = $this->amCustom->GetVar($channel, 'CONTEXT', '', false);
                if(str_starts_with($context, 'ivr-')){
                    $extension = str_replace('ivr-', '', $context);
                    $inApp = true;
                }else{
                    $extension = $this->amCustom->GetVar($channel, 'EXTEN', '', false);
                    $inApp = $context === 'applications';
                }

                $chanData = [
                    'ChannelStateDesc'  => $this->amCustom->GetVar($channel, 'CHANNEL(state)', '', false),
                    'CallerIDNum'       => $this->amCustom->GetVar($channel, 'CALLERID(num)','', false),
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
        $result = $this->amCustom->sendRequestTimeout('PJSIPShowEndpoints', [], 200000);
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
        $this->amCustom = new CustomAsteriskManager(); // Оригинальный AsteriskManager работает плохо с BridgeList и BridgeInfo
        $this->amCustom->connect("127.0.0.1:$amiPort", MonitorActiveCallsConf::AMI_USER, MonitorActiveCallsConf::AMI_USER);

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
        if('Hangup' === $parameters['Event']){
            $linkedId = $parameters['Linkedid'];
            $channel  = $parameters['Channel'];
            $endpoint = self::getEndpointName($channel);
            unset($this->activeChannels[$linkedId][$channel]);
            unset($this->states[$endpoint]['channels'][$channel]);
            if(empty($this->activeChannels[$linkedId])){
                unset($this->activeChannels[$linkedId]);
                unset($this->callType[$linkedId]);
            }
        }elseif(in_array($parameters['Event'],['Newchannel','Newstate']) && stripos($parameters['Channel'], 'local') === false){
            $linkedId = $parameters['Linkedid'];
            $endpoint   = self::getEndpointName($parameters['Channel']);

            if(str_starts_with($parameters['Context'], 'ivr-')){
                $extension = str_replace('ivr-', '', $parameters['Context']);
                $inApp = true;
            }else{
                $extension = $parameters['Exten'];
                $inApp = $parameters['Context'] === 'applications';
            }

            $chanData = [
                'ChannelStateDesc'  => $parameters['ChannelStateDesc'],
                'CallerIDNum'       => $parameters['CallerIDNum'],
                'Uniqueid'          => $parameters['Uniqueid'],
                'Endpoint'          => $endpoint,
                'Type'              => (stripos($endpoint, 'SIP-') !== false)?self::ENDPOINT_TYPE_PROVIDER:self::ENDPOINT_TYPE_PEER,
                'Exten'             => $extension,
                'InApp'             => $inApp,
            ];

            if($chanData['Type'] === self::ENDPOINT_TYPE_PEER){
                $this->states[$endpoint]['channels'][$parameters['Channel']] = true;
                if($this->states[$endpoint]['state'] <> self::STATE_UP){
                    $this->states[$endpoint]['state'] = $chanData['ChannelStateDesc'];
                }
            }
            if(!isset($this->activeChannels[$linkedId])){
                $did = '';
                if($chanData['Type'] === self::ENDPOINT_TYPE_PROVIDER){
                    $callType = self::CALL_TYPE_IN;
                    $did = $parameters['Exten'];
                }elseif ($chanData['Type'] === self::ENDPOINT_TYPE_PEER && strlen($parameters['Exten']) < 5){
                    $callType = self::CALL_TYPE_INNER;
                }else{
                    $callType = self::CALL_TYPE_OUT;
                }
                $this->callType[$linkedId] = [
                    'type'      => $callType,
                    'src_chan'  => $parameters['Channel'],
                    'did'       => $did,
                    'time'     => str_replace('mikopbx-','',$chanData['Uniqueid'])
                ];
            }

            if($this->callType[$linkedId]['src_chan'] <> $parameters['Channel'] &&  $chanData['ChannelStateDesc'] === self::STATE_UP){
                // Обновляем время ответа на вызов.
                $this->callType[$linkedId]['answer'] = $parameters['Timestamp'];
            }
            $this->activeChannels[$linkedId][$parameters['Channel']] = $chanData;
        }elseif ('NewCallerid' === $parameters['Event'] && str_starts_with($parameters['Channel'], 'PJSIP/') &&
                 isset($this->activeChannels[$parameters['Linkedid']][$parameters['Channel']]) ){
            $this->activeChannels[$parameters['Linkedid']][$parameters['Channel']]['CallerIDNum'] = $parameters['CallerIDNum'];
        }elseif ('BridgeEnter' === $parameters['Event']){
            $linkedId = $parameters['Linkedid'];
            $this->activeBridges[$linkedId][$parameters['BridgeUniqueid']][$parameters['Channel']] = $parameters['Timestamp'];
        }elseif ('ChanSpyStart' === $parameters['Event']){

            if(stripos($parameters['SpyerChannel'], 'local') !==false){
                $linkedId = $parameters['SpyerLinkedid'];
                $tmpBridgeStart = time();
                $tmpDstChannel =  $this->swapLocalSuffix($parameters['SpyerChannel']);
                $orgChan = $this->findBridgeChannel($linkedId,$tmpDstChannel, $tmpBridgeStart)?$tmpDstChannel:'';
            }else{
                $orgChan = $parameters['SpyerChannel'];
            }
            $this->spyerChannels[$parameters['SpyerLinkedid']] = [
                'spyer' => true,
                'src_chan'       => $orgChan,
                'src_num'        => $parameters['SpyerCallerIDNum'],
                'dst_chan'       => $parameters['SpyeeChannel'],
                'dst_num'        => $parameters['SpyeeCallerIDNum'],
            ];
            $this->spyerChannels[$parameters['SpyeeLinkedid']] = [
                'spyer' => false,
                'src_chan'       => $orgChan,
                'src_num'        => $parameters['SpyerCallerIDNum'],
                'dst_chan'       => $parameters['SpyeeChannel'],
                'dst_num'        => $parameters['SpyeeCallerIDNum'],
            ];

        }elseif ('ChanSpyStop' === $parameters['Event']){
            unset(
                $this->spyerChannels[$parameters['SpyeeLinkedid']],
                $this->spyerChannels[$parameters['SpyerLinkedid']]
            );
        }elseif ('BridgeLeave' === $parameters['Event']){
            $linkedId = $parameters['Linkedid'];
            unset($this->activeBridges[$linkedId][$parameters['BridgeUniqueid']][$parameters['Channel']]);
            if(empty($this->activeBridges[$linkedId][$parameters['BridgeUniqueid']])){
                unset($this->activeBridges[$linkedId][$parameters['BridgeUniqueid']]);
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
        if('QueueCallerJoin' === $parameters['Event']){
            $this->queueEntryes[$parameters['Queue']][$parameters['Channel']] = [
                'EnterTime'     => time(),
                'Uniqueid'      => $parameters['Uniqueid'],
                'Linkedid'      => $parameters['Linkedid']
            ];

            $this->callType[$parameters['Linkedid']]['queue'] = $parameters['Queue'];
        }elseif ('QueueMemberStatus' === $parameters['Event'] && isset($this->mobileStates[$parameters['MemberName']])){
            $this->mobileStates[$parameters['MemberName']]['state'] = self::QUEUE_AGENT_STATES[$parameters['Status']]??self::STATE_UNAVAILIBLE;
        }elseif ('QueueCallerLeave' === $parameters['Event'] ){
            unset($this->queueEntryes[$parameters['Queue']][$parameters['Channel']]);
            if(empty($this->queueEntryes[$parameters['Queue']])){
                unset($this->queueEntryes[$parameters['Queue']]);
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
        if ($parameters['Event'] === 'UserEvent' && $this->replyOnPingRequest($parameters)){
            $this->logger->writeInfo($parameters,'update settings...');
            $this->getExtensionsInfo();
            $this->collectQueuesInfo();
            return;
        }
        if($parameters['Event'] === 'ExtensionStatus'){
            if(isset($this->states[$parameters['Exten']])){
                $this->states[$parameters['Exten']]['state'] = $parameters['StatusText'];
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