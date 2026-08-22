<?php
/*
 * MikoPBX - free phone system for small business
 * Copyright © 2017-2022 Alexey Portnov and Nikolay Beketov
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
require_once 'Globals.php';

use MikoPBX\Common\Models\PbxSettings;
use MikoPBX\Core\Asterisk\AsteriskManager;
use MikoPBX\Core\System\BeanstalkClient;
use MikoPBX\Core\System\SystemMessages;
use MikoPBX\Core\System\Util;
use MikoPBX\Core\Workers\WorkerBase;
use MikoPBX\PBXCoreREST\Lib\PBXApiResult;
use Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager as CustomAsteriskManager;
use Modules\ModuleMonitorActiveCalls\Lib\Logger;
use Modules\ModuleMonitorActiveCalls\Lib\MikoPBXVersion;
use Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsConf;

class WorkerAmiActions extends WorkerBase
{
    private const ALLOWED_API_METHODS = ['restAPICallback', 'getChannels'];

    public Logger $logger;

    public int $countReq = 0;
    public float $counterStartTime = 0;
    /**
     * Handles the received signal.
     *
     * @param int $signal The signal to handle.
     *
     * @return void
     */
    public function signalHandler(int $signal): void
    {
        parent::signalHandler($signal);
        cli_set_process_title('SHUTDOWN_'.cli_get_process_title());
        $this->needRestart = true;
        $this->logger->writeInfo('signalHandler...'.$signal);
    }


    /**
     * Подключение к AMI.
     * @param string $events
     * @return CustomAsteriskManager
     */
    public function getAstManager(string $events = 'off'):CustomAsteriskManager
    {
        $am     = new CustomAsteriskManager();
        $port   = PbxSettings::getValueByKey('AMIPort');
        $result = $am->connect("127.0.0.1:$port", MonitorActiveCallsConf::AMI_USER, MonitorActiveCallsConf::AMI_USER, $events);
        if(!$result){
            $this->logger->writeError('Fail connect AMI...');
        }
        return $am;
    }

    /**
     * Executes one command in a short-lived AMI session.
     *
     * @param callable $operation
     * @return mixed
     */
    private function executeWithAmi(callable $operation)
    {
        $manager = $this->getAstManager();
        try {
            if (!$manager->loggedIn()) {
                throw new \RuntimeException('AMI is unavailable');
            }
            return $operation($manager);
        } finally {
            $manager->disconnect();
        }
    }

    /**
     * Старт работы листнера.
     *
     * @param $argv
     */
    public function start($argv):void
    {
        $this->logger = new Logger('AmiActions', 'ModuleMonitorActiveCalls');
        $this->logger->writeInfo('Starting...');
        $beanstalk      = new BeanstalkClient(self::class);
        $beanstalk->subscribe(self::class, [$this, 'onEvents']);
        $beanstalk->subscribe($this->makePingTubeName(self::class), [$this, 'pingCallBack']);
        while ($this->needRestart === false) {
            try {
                $beanstalk->wait();
            } catch (\Throwable $e) {
                $this->logger->writeError('Beanstalk error: ' . $e->getMessage());
                sleep(1);
                $beanstalk->reconnect();
            }
        }
    }

    /**
     * Получение запросов на идентификацию номера телефона.
     * @param $tube
     * @return void
     */
    public function onEvents($tube): void
    {
        try {
            $data = json_decode($tube->getBody(), true);
        }catch (\Throwable $e){
            return;
        }
        $this->logger->writeInfo($data, 'Events...');
        $res_data = '';
        $funcName = $data['function'] ?? '';
        if (in_array($funcName, self::ALLOWED_API_METHODS, true)) {
            try {
                $args = $data['args'] ?? [];
                if (count($args) === 0) {
                    $res_data = $this->$funcName();
                } else {
                    $res_data = $this->$funcName(...$args);
                }
                $this->logger->writeInfo($res_data, 'Result...');
                $res_data = $this->saveResultInTmpFile(serialize($res_data));
            } catch (\Throwable $e) {
                $this->logger->writeError("Error in $funcName: " . $e->getMessage());
            }
        } else {
            $this->logger->writeError("Method not allowed: $funcName");
        }
        $tube->reply($res_data);
    }

    /**
     *  Process CoreAPI requests under root rights
     *
     * @param array $request
     *
     * @return PBXApiResult
     */
    public function restAPICallback(array $request): PBXApiResult
    {
        $res = new PBXApiResult();
        $res->processor = __METHOD__;

        try {
            $action = strtolower($request['action'] ?? '');
            $data   = $request['data'] ?? [];
            $ch1    = $data['ch1'] ?? '';
            $ch2    = $data['ch2'] ?? '';
            $number = $data['number'] ?? '';

            $srcEndpoint = WorkerActiveCalls::getEndpointName($ch1);
            $dstEndpoint = WorkerActiveCalls::getEndpointName($ch2);

            if (is_numeric($srcEndpoint)) {
                $actionChannel = $ch1;
            } elseif (is_numeric($dstEndpoint)) {
                $actionChannel = $ch2;
            } else {
                $actionChannel = $ch2;
            }

            $this->executeWithAmi(
                static function (CustomAsteriskManager $manager) use (
                    $action,
                    $actionChannel,
                    $ch1,
                    $number,
                    $res
                ): void {
                    if ('join' === $action) {
                        $variable = "pt1c_cid=SPY-{$number},ALLOW_MULTY_ANSWER=1";
                        $channel  = "Local/{$number}@internal-originate";
                        $amiResult = $manager->Originate($channel, null, null, null, 'ChanSpy', $actionChannel.',qBS', null, $number, $variable);
                        $res->success = ($amiResult['Response'] ?? '') === 'Success';
                        SystemMessages::sysLogMsg('SPY-ACTIVE-CHAN', "$action: {$number} to $actionChannel. mode 'qBS'");
                    } elseif ('whisper' === $action) {
                        $variable = "pt1c_cid=SPY-{$number},ALLOW_MULTY_ANSWER=1";
                        $channel  = "Local/{$number}@internal-originate";
                        $amiResult = $manager->Originate($channel, null, null, null, 'ChanSpy', $actionChannel.',qwS', null, $number, $variable);
                        $res->success = ($amiResult['Response'] ?? '') === 'Success';
                        SystemMessages::sysLogMsg('SPY-ACTIVE-CHAN', "$action: {$number} to $actionChannel. mode 'qw'");
                    } elseif ('listen' === $action) {
                        $variable = "pt1c_cid=SPY-{$number},ALLOW_MULTY_ANSWER=1";
                        $channel  = "Local/{$number}@internal-originate";
                        $amiResult = $manager->Originate($channel, null, null, null, 'ChanSpy', $actionChannel.',qS', null, $number, $variable);
                        $res->success = ($amiResult['Response'] ?? '') === 'Success';
                        SystemMessages::sysLogMsg('SPY-ACTIVE-CHAN', "$action: {$number} to $actionChannel. mode 'qoS'");
                    } elseif ('hangup' === $action) {
                        $amiResult = $manager->Hangup($ch1);
                        $res->success = ($amiResult['Response'] ?? '') === 'Success';
                    } else {
                        $res->success    = false;
                        $res->messages[] = 'API action not found in moduleRestAPICallback ModuleMonitorActiveCalls ' . $action;
                    }
                }
            );
        } catch (\Throwable $e) {
            $res->success = false;
            $res->messages[] = 'restAPICallback error: ' . $e->getMessage();
            $this->logger->writeError('restAPICallback error: ' . $e->getMessage());
        }
        return $res;
    }

    public function getChannels()
    {
        return $this->executeWithAmi(
            static fn (CustomAsteriskManager $manager) => $manager->getChannels()
        );
    }

    /**
     * Сериализует данные и сохраняет их во временный файл.
     * @param $data
     * @return string
     */
    private function saveResultInTmpFile($data):string
    {
        try {
            $res_data = json_encode($data, JSON_THROW_ON_ERROR);
        }catch (\JsonException $e){
            return '';
        }
        $downloadCacheDir = '/tmp/';
        $tmpDir = '/tmp/';
        $di = MikoPBXVersion::getDefaultDi();
        if ($di) {
            $dirsConfig = $di->getShared('config');
            $tmoDirName = $dirsConfig->path('core.tempDir') . '/WorkerAmiActions';
            Util::mwMkdir($tmoDirName);
            chown($tmoDirName, 'www');
            if (file_exists($tmoDirName)) {
                $tmpDir = $tmoDirName;
            }

            $downloadCacheDir = $dirsConfig->path('www.downloadCacheDir');
            if (!file_exists($downloadCacheDir)) {
                $downloadCacheDir = '';
            }
        }
        $fileBaseName = md5(microtime(true));
        // "temp-" in the filename is necessary for the file to be automatically deleted after 5 minutes.
        $filename = $tmpDir . '/temp-' . $fileBaseName;
        file_put_contents($filename, $res_data);
        if (!empty($downloadCacheDir)) {
            $linkName = $downloadCacheDir . '/' . $fileBaseName;
            // For automatic file deletion.
            // A file with such a symlink will be deleted after 5 minutes by cron.
            Util::createUpdateSymlink($filename, $linkName, true);
        }
        chown($filename, 'www');
        return $filename;
    }

    /**
     * Выполнение метода API через свойство worker $this->AmoCrmMain
     * Метод следует вызывать при работе с API из прочих процессов.
     * @param $function
     * @param $args
     * @param int $timeout
     * @return mixed|PBXApiResult
     */
    public static function invokeApi($function, $args, int $timeout = 20)
    {
        $req = [
            'function' => $function,
            'args' => $args
        ];
        $client = new BeanstalkClient(self::class);
        try {
            $result = $client->request(json_encode($req, JSON_THROW_ON_ERROR), $timeout);
            if(file_exists($result)){
                $filename = $result;
                $result = json_decode(file_get_contents($result), true, 512, JSON_THROW_ON_ERROR);
                unlink($filename);
                unset($filename);
            }
            $object = unserialize($result, ['allowed_classes' => [PBXApiResult::class]]);
        } catch (\Throwable $e) {
            $object = new PBXApiResult();
            $object->success = false;
            $object->messages[] = $e->getMessage();
        }
        return $object;
    }

    /**
     * Разрешкно только 10 запросов в секунду. Принудительное ожидание.
     * @return void
     */
    public function needSleep():void{
        $nowTime   = microtime(true);
        $deltaTime = $nowTime - $this->counterStartTime;
        if( $deltaTime > 1 ){
            $this->countReq = 0;
            $deltaTime = 0;
            $this->counterStartTime = $nowTime;
        }
        $this->countReq++;
        if($deltaTime>0 && $this->countReq>10){
            usleep($deltaTime * 1000000);
            $this->countReq = 0;
        }
    }

}

if(isset($argv) && count($argv) !== 1
    && Util::getFilePathByClassName(WorkerAmiActions::class) === $argv[0]){
    WorkerAmiActions::startWorker($argv??[]);
}
