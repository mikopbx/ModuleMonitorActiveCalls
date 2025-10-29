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

use DateTime;
use MikoPBX\Common\Models\Extensions;
use MikoPBX\Core\System\BeanstalkClient;
use MikoPBX\Core\System\SystemMessages;
use MikoPBX\Core\Workers\WorkerBase;
use MikoPBX\Core\System\Util;
use MikoPBX\Core\Workers\WorkerCdr;
use Exception;
use Throwable;
use Modules\ModuleMonitorActiveCalls\Lib\CacheManager;

require_once 'Globals.php';

class ActiveCallsFromCdr extends WorkerBase
{
    private array $innerNumbers = [];

    private function updateSettings():void
    {
        $filter = [
            "type = :extType:",
            'columns'   => 'number',
            'bind'  => [
                'extType' => Extensions::TYPE_SIP
            ]
        ];
        $this->innerNumbers = array_column(Extensions::find($filter)->toArray(), 'number');
    }

    /**
     * @param $argv
     * @return void
     * @throws Exception
     */
    public function start($argv):void
    {
        while ($this->needRestart === false){
            usleep(1500000);
            $this->updateSettings();

            $filter = [
                'endtime=""',
                'order' => 'id',
                'columns' => 'start,answer,src_chan,dst_chan,src_num,dst_num,did,linkedid,is_app,UNIQUEID AS uid',
                'miko_tmp_db' => true,
            ];
            $cdrData = $this->getCdr($filter);

            $channels = [];
            foreach ($cdrData as $row) {
                if (empty($row['dst_chan']) && empty($row['src_chan'])) {
                    continue;
                }
                $row['typeCall'] = $this->getRowType($row);

                $dateStart = new DateTime($row['start']);
                $row['startTime'] = $dateStart->format('H:i:s');
                if(empty($row['answer'])){
                    $row['waitTime']  = time() - $dateStart->getTimestamp();
                }else{
                    $dateAnswer       = new DateTime($row['answer']);
                    $row['waitTime']  = $dateAnswer->getTimestamp() - $dateStart->getTimestamp();
                }
                $row['duration']  = time() - $dateStart->getTimestamp();
                $channels[] = $row;
            }
            CacheManager::setCacheData('getActiveChannelsAction', $channels, 5);
        }
    }

    /**
     * Определяет, является ли номер в CDR внутренним.
     * @param array $cdr
     * @param string $fieldName
     * @return bool
     */
    private function isInnerCdr(array $cdr, string $fieldName):bool{
        $number  = $cdr["{$fieldName}_num"];
        $channel = $cdr["{$fieldName}_chan"];
        if(empty($channel) && in_array($number, $this->innerNumbers, true)){
            return true;
        }
        if(mb_strlen($number) > 4 && !in_array($number, $this->innerNumbers, true)){
            return false;
        }
        return is_numeric($number) && strpos($channel, "/$number-") !== false;
    }

    /**
     * Retrieves all completed temporary CDRs.
     * @param array $filter  An array of filter parameters.
     * @return array An array of CDR data.
     */
    public function getCdr(array $filter = []): array
    {
        $filter['miko_result_in_file'] = true;
        $client = new BeanstalkClient(WorkerCdr::SELECT_CDR_TUBE);
        try {
            [$result, $message] = $client->sendRequest(json_encode($filter, JSON_THROW_ON_ERROR), 15);
            if ($result!==false){
                $filename = json_decode($message, true, 512, JSON_THROW_ON_ERROR);
            }else{
                $filename = '';
            }
        } catch (Throwable $e) {
            $filename = '';
        }
        $result_data = [];
        if (is_string($filename) && file_exists($filename)) {
            try {
                $result_data = json_decode(file_get_contents($filename), true, 512, JSON_THROW_ON_ERROR);
            } catch (Throwable $e) {
                SystemMessages::sysLogMsg('SELECT_CDR_TUBE', 'Error parse response.');
            }
            $findPath = Util::which('find');
            $downloadCacheDir = $this->di->getShared('config')->path('www.downloadCacheDir');
            shell_exec("$findPath -L $downloadCacheDir -samefile  $filename -delete");
            unlink($filename);
        }
        return $result_data;
    }

    /**
     * @param $row
     * @return string
     */
    private function getRowType($row):string
    {
        $srcInner = $this->isInnerCdr($row, 'src');
        $dstInner = $this->isInnerCdr($row, 'dst');
        if (($srcInner && !$dstInner) || (stripos($row['src_chan'], 'local/') !== false && stripos($row['dst_chan'], 'pjsip/sip') !== false)) {
            $typeCall = 'outgoing';
        } elseif ($srcInner && ($row['is_app'] === '1' || $dstInner)) {
            $typeCall = 'inner';
        } else {
            $typeCall = 'incoming';
        }
        return $typeCall;
    }
}

if(isset($argv) && count($argv) !== 1
    && Util::getFilePathByClassName(ActiveCallsFromCdr::class) === $argv[0]){
    // Start worker process
    ActiveCallsFromCdr::startWorker($argv??[]);
}